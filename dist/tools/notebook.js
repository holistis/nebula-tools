/**
 * Notebook Tools
 *
 * Tools for reading, writing, and manipulating notebook cells.
 */
import { createAdaptivePoller } from '../utils/polling.js';
// =============================================================================
// Shared Utilities
// =============================================================================
function formatCellPreview(cell, index) {
    const typeTag = cell.type === 'code' ? '[code]' : '[md]';
    const execCount = cell.executionCount ? ` [${cell.executionCount}]` : '';
    const firstLine = cell.content.split('\n')[0].substring(0, 60);
    const moreLines = cell.content.split('\n').length > 1 ? '...' : '';
    return `${index}: ${typeTag} id="${cell.id}"${execCount} ${firstLine}${moreLines}`;
}
function formatOutputs(outputs) {
    return outputs.map(o => {
        if (o.type === 'image') {
            return { type: 'image', data: o.content, mimeType: 'image/png' };
        }
        const prefix = o.type === 'error' ? '[ERROR] ' : '';
        return { type: 'text', text: prefix + o.content };
    });
}
export const readNotebookTool = {
    definition: {
        name: 'read_notebook',
        description: 'Read all cells from a notebook. Use format="brief" for overview, "detailed" for full content. Outputs are included and truncated by default (100 lines, 10000 chars per output). Use include_outputs=false to exclude outputs entirely.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file (.ipynb)' },
                include_outputs: { type: 'boolean', description: 'Include cell outputs (default: true). Outputs are automatically truncated.' },
                format: { type: 'string', enum: ['brief', 'detailed'], description: 'Output format (default: brief)' },
                max_lines: { type: 'number', description: 'Max lines per output (default: 100)' },
                max_chars: { type: 'number', description: 'Max chars per output (default: 10000)' },
            },
            required: ['path'],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        const result = await client.readNotebookViaRouter(params.path, {
            includeOutputs: params.include_outputs ?? true, // Default to true
            maxLines: params.max_lines,
            maxChars: params.max_chars,
        });
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const notebook = result.data;
        return {
            success: true,
            data: {
                path: params.path,
                cells: notebook.cells,
                totalCells: notebook.cells.length,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { path, cells, totalCells } = result.data;
        const lines = [`Notebook: ${path} (${totalCells} cells)\n`];
        cells.forEach((cell, i) => lines.push(formatCellPreview(cell, i)));
        return [{ type: 'text', text: lines.join('\n') }];
    },
};
export const readCellTool = {
    definition: {
        name: 'read_cell',
        description: 'Read a specific cell content and metadata (not outputs). Use read_output to get outputs.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_index: { type: 'number', description: 'Cell index (0-based). Use this OR cell_id.' },
                cell_id: { type: 'string', description: 'Stable cell ID. Use this OR cell_index.' },
            },
            required: ['path'],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        if (params.cell_index === undefined && !params.cell_id) {
            return { success: false, error: 'Must provide cell_index or cell_id' };
        }
        const result = await client.readCellOp(params.path, {
            cellIndex: params.cell_index,
            cellId: params.cell_id,
        });
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { cell, cellIndex } = result.data;
        const execInfo = cell.executionCount ? ` execution #${cell.executionCount}` : '';
        return [{ type: 'text', text: `Cell ${cellIndex} [${cell.type}] id="${cell.id}"${execInfo}\n---\n${cell.content}` }];
    },
};
export const readOutputTool = {
    definition: {
        name: 'read_output',
        description: 'Read cell outputs with smart truncation. Large outputs are automatically truncated (100 lines, 10000 chars) and can be paginated with line_offset. Use save_to_file=true to save complete output to a temp file for analysis.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_index: { type: 'number', description: 'Cell index (0-based). Use this OR cell_id.' },
                cell_id: { type: 'string', description: 'Stable cell ID. Use this OR cell_index.' },
                output_offset: { type: 'number', description: 'Skip first N outputs (default: 0)' },
                max_wait: { type: 'number', description: 'Wait up to N seconds for new outputs (default: 0)' },
                max_lines: { type: 'number', description: 'Maximum lines to return per output (default: 100)' },
                max_chars: { type: 'number', description: 'Maximum characters to return per output (default: 10000)' },
                line_offset: { type: 'number', description: 'Skip first N lines for pagination (default: 0). Use with truncation metadata to paginate through large outputs.' },
                save_to_file: { type: 'boolean', description: 'Save full output to temp file for analysis (default: false).' },
            },
            required: ['path'],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        if (params.cell_index === undefined && !params.cell_id) {
            return { success: false, error: 'Must provide cell_index or cell_id' };
        }
        const maxWait = params.max_wait ?? 0;
        // Build truncation options
        const truncationOpts = {
            maxLines: params.max_lines,
            maxChars: params.max_chars,
            lineOffset: params.line_offset,
            saveToFile: params.save_to_file,
        };
        // For immediate reads, use efficient operation router
        if (maxWait <= 0) {
            const result = await client.readCellOutputOp(params.path, {
                cellIndex: params.cell_index,
                cellId: params.cell_id,
                ...truncationOpts,
            });
            if (!result.success) {
                return { success: false, error: result.error };
            }
            const offset = params.output_offset ?? 0;
            const allOutputs = result.data.outputs;
            return {
                success: true,
                data: {
                    cellId: result.data.cellId,
                    cellIndex: result.data.cellIndex,
                    outputs: offset > 0 ? allOutputs.slice(offset) : allOutputs,
                    totalOutputs: allOutputs.length,
                    temp_files: result.data.temp_files,
                },
            };
        }
        // Adaptive polling: start with 50ms, exponentially increase to 1000ms
        const startTime = Date.now();
        const poller = createAdaptivePoller({ initialInterval: 50, maxInterval: 1000 });
        let lastOutputCount = 0;
        while (Date.now() - startTime < maxWait * 1000) {
            const result = await client.readCellOutputOp(params.path, {
                cellIndex: params.cell_index,
                cellId: params.cell_id,
                ...truncationOpts,
            });
            if (!result.success) {
                return { success: false, error: result.error };
            }
            const allOutputs = result.data.outputs;
            const offset = params.output_offset ?? 0;
            const newOutputs = offset > 0 ? allOutputs.slice(offset) : allOutputs;
            // If we have new outputs since last poll, return them
            if (allOutputs.length > lastOutputCount) {
                return {
                    success: true,
                    data: {
                        cellId: result.data.cellId,
                        cellIndex: result.data.cellIndex,
                        outputs: newOutputs,
                        totalOutputs: allOutputs.length,
                        temp_files: result.data.temp_files,
                    },
                };
            }
            lastOutputCount = allOutputs.length;
            await poller.wait();
            poller.incrementInterval();
        }
        // Timeout - return current outputs
        const finalResult = await client.readCellOutputOp(params.path, {
            cellIndex: params.cell_index,
            cellId: params.cell_id,
            ...truncationOpts,
        });
        if (!finalResult.success) {
            return { success: false, error: finalResult.error };
        }
        const offset = params.output_offset ?? 0;
        const allOutputs = finalResult.data.outputs;
        return {
            success: true,
            data: {
                cellId: finalResult.data.cellId,
                cellIndex: finalResult.data.cellIndex,
                outputs: offset > 0 ? allOutputs.slice(offset) : allOutputs,
                totalOutputs: allOutputs.length,
                temp_files: finalResult.data.temp_files,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { cellId, outputs, totalOutputs, temp_files } = result.data;
        if (outputs.length === 0) {
            return [{ type: 'text', text: `Cell ${cellId}: No outputs (total: ${totalOutputs})` }];
        }
        const mcpOutputs = [];
        let headerInfo = `Cell ${cellId}: ${outputs.length} outputs (total: ${totalOutputs})`;
        // Add temp file info if present
        if (temp_files && temp_files.length > 0) {
            headerInfo += `\n📁 Large output saved to: ${temp_files.join(', ')}`;
        }
        mcpOutputs.push({ type: 'text', text: headerInfo + '\n' });
        // Format each output with truncation metadata
        for (const output of outputs) {
            if (output.type === 'image') {
                mcpOutputs.push({ type: 'image', data: output.content, mimeType: 'image/png' });
                continue;
            }
            let text = output.type === 'error' ? '[ERROR] ' + output.content : output.content;
            // Add truncation info if applicable
            if (output.truncated) {
                const range = output.returned_range;
                const info = [
                    `\n--- [TRUNCATED: ${output.truncation_reason}]`,
                    `Lines ${range?.start_line ?? 0}-${range?.end_line ?? '?'} of ${output.total_lines ?? '?'}`,
                    `(${range?.char_count ?? '?'} of ${output.total_chars ?? '?'} chars)`,
                ];
                if (output.temp_file) {
                    info.push(`Full output saved to: ${output.temp_file}`);
                }
                text += info.join(' | ') + ' ---';
            }
            mcpOutputs.push({ type: 'text', text });
        }
        return mcpOutputs;
    },
};
export const insertCellTool = {
    definition: {
        name: 'insert_cell',
        description: 'Insert a new cell into the notebook. Use position=-1 or omit to append at end.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_id: { type: 'string', description: 'Unique ID for the new cell' },
                content: { type: 'string', description: 'Cell content' },
                cell_type: { type: 'string', enum: ['code', 'markdown'], description: 'Cell type (default: code)' },
                position: { type: 'number', description: 'Position to insert at (0-based). Use -1 or omit to append.' },
            },
            required: ['path', 'cell_id', 'content'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const { path, cell_id, content, cell_type = 'code', position = -1 } = params;
        const result = await client.insertCellOp(path, position, {
            id: cell_id,
            type: cell_type,
            content,
        });
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { cellIndex, cellId, idModified, requestedId } = result.data;
        let msg = `Inserted cell at index ${cellIndex}, id="${cellId}"`;
        if (idModified) {
            msg += ` (requested "${requestedId}" was auto-fixed)`;
        }
        return [{ type: 'text', text: msg }];
    },
};
export const updateCellTool = {
    definition: {
        name: 'update_cell',
        description: 'Update an existing cell by its stable ID. Can update content and/or type.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_id: { type: 'string', description: 'Cell ID to update' },
                content: { type: 'string', description: 'New cell content (optional)' },
                cell_type: { type: 'string', enum: ['code', 'markdown'], description: 'New cell type (optional)' },
            },
            required: ['path', 'cell_id'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const { path, cell_id, content, cell_type } = params;
        if (content === undefined && cell_type === undefined) {
            return { success: false, error: 'Must provide content or cell_type to update' };
        }
        // If content is provided, update it
        if (content !== undefined) {
            const result = await client.updateContentOp(path, cell_id, content);
            if (!result.success) {
                return { success: false, error: result.error };
            }
        }
        // If cell_type is provided, update metadata
        if (cell_type !== undefined) {
            const result = await client.updateMetadataOp(path, cell_id, { type: cell_type });
            if (!result.success) {
                return { success: false, error: result.error };
            }
        }
        // Read back to get cell index
        const readResult = await client.readCellOp(path, { cellId: cell_id });
        if (!readResult.success) {
            return { success: false, error: readResult.error };
        }
        return {
            success: true,
            data: { cellIndex: readResult.data.cellIndex, cellId: cell_id },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { cellIndex, cellId } = result.data;
        return [{ type: 'text', text: `Updated cell at index ${cellIndex}, id="${cellId}"` }];
    },
};
export const deleteCellTool = {
    definition: {
        name: 'delete_cell',
        description: 'Delete a cell from a notebook',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_index: { type: 'number', description: 'Cell index to delete (0-based)' },
                cell_id: { type: 'string', description: 'Cell ID to delete' },
            },
            required: ['path'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        if (params.cell_index === undefined && !params.cell_id) {
            return { success: false, error: 'Must provide cell_index or cell_id' };
        }
        const result = await client.deleteCellOp(params.path, {
            cellIndex: params.cell_index,
            cellId: params.cell_id,
        });
        return result.success ? { success: true } : { success: false, error: result.error };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        return [{ type: 'text', text: 'Cell deleted' }];
    },
};
export const clearNotebookTool = {
    definition: {
        name: 'clear_notebook',
        description: 'Delete all cells from a notebook. Useful for starting fresh without creating a new file.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
            },
            required: ['path'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        // Use single clearNotebook operation instead of N+1 loop (Phase 1 optimization)
        const result = await client.clearNotebookOp(params.path);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return {
            success: true,
            data: {
                deletedCount: result.data.deletedCount
            }
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { deletedCount } = result.data;
        if (deletedCount === 0) {
            return [{ type: 'text', text: 'Notebook was already empty' }];
        }
        return [{ type: 'text', text: `Cleared notebook: deleted ${deletedCount} cells` }];
    },
};
export const moveCellTool = {
    definition: {
        name: 'move_cell',
        description: 'Move a cell from one position to another',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                from_index: { type: 'number', description: 'Current cell index (0-based)' },
                to_index: { type: 'number', description: 'Target cell index (0-based)' },
            },
            required: ['path', 'from_index', 'to_index'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const result = await client.moveCellOp(params.path, params.from_index, params.to_index);
        return result.success ? { success: true } : { success: false, error: result.error };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        return [{ type: 'text', text: 'Cell moved' }];
    },
};
export const duplicateCellTool = {
    definition: {
        name: 'duplicate_cell',
        description: 'Duplicate a cell, inserting the copy immediately after the original',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_index: { type: 'number', description: 'Cell index to duplicate (0-based)' },
            },
            required: ['path', 'cell_index'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        // Generate a unique ID for the duplicated cell
        const newCellId = `cell-dup-${Date.now()}`;
        const result = await client.duplicateCellOp(params.path, params.cell_index, newCellId);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        // Use metadata from response instead of extra read (Phase 1.2 optimization)
        const totalCells = result.data.metadata?.totalCells ?? result.data.cellIndex + 1;
        return {
            success: true,
            data: {
                newCellIndex: result.data.cellIndex,
                totalCells,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { newCellIndex, totalCells } = result.data;
        return [{ type: 'text', text: `Cell duplicated at index ${newCellIndex} (${totalCells} cells total)` }];
    },
};
export const searchCellsTool = {
    definition: {
        name: 'search_cells',
        description: 'Search notebook cells by keyword',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                query: { type: 'string', description: 'Search query (keywords)' },
                limit: { type: 'number', description: 'Maximum results (default: 5)' },
            },
            required: ['path', 'query'],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        const result = await client.searchCells(params.path, params.query, params.limit ?? 5);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { cells } = result.data;
        if (cells.length === 0) {
            return [{ type: 'text', text: 'No matching cells found' }];
        }
        const lines = [`Found ${cells.length} cells:\n`];
        cells.forEach(c => {
            const preview = c.content.split('\n')[0].substring(0, 80);
            lines.push(`Cell ${c.index} [${c.type}] (score: ${c.score.toFixed(1)})`);
            lines.push(`  ${preview}${c.content.length > 80 ? '...' : ''}`);
        });
        return [{ type: 'text', text: lines.join('\n') }];
    },
};
export const updateMetadataTool = {
    definition: {
        name: 'update_metadata',
        description: 'Update cell metadata (id, type, scrolled, scrolledHeight). Validates against schema.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_id: { type: 'string', description: 'Current cell ID to update' },
                changes: { type: 'object', description: 'Metadata changes: id, type, scrolled, scrolledHeight' },
            },
            required: ['path', 'cell_id', 'changes'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        if (!params.changes || Object.keys(params.changes).length === 0) {
            return { success: false, error: 'No changes provided' };
        }
        // Read cell before to get old values
        const beforeResult = await client.readCellOp(params.path, { cellId: params.cell_id });
        if (!beforeResult.success) {
            return { success: false, error: beforeResult.error };
        }
        const oldCell = beforeResult.data.cell;
        const cellIndex = beforeResult.data.cellIndex;
        // Apply the update
        const result = await client.updateMetadataOp(params.path, params.cell_id, params.changes);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        // Compute changes from requested changes and old values
        const changes = {};
        const oldCellId = 'id' in params.changes ? params.cell_id : undefined;
        let newCellId = params.cell_id;
        for (const [key, newValue] of Object.entries(params.changes)) {
            const oldValue = oldCell[key];
            changes[key] = { old: oldValue, new: newValue };
            if (key === 'id') {
                newCellId = newValue;
            }
        }
        return {
            success: true,
            data: {
                cellId: newCellId,
                cellIndex,
                changes,
                oldCellId,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { cellIndex, changes, oldCellId, cellId } = result.data;
        const changesSummary = Object.entries(changes)
            .map(([k, v]) => `${k}: ${JSON.stringify(v.old)} → ${JSON.stringify(v.new)}`)
            .join(', ');
        let msg = `Cell ${cellIndex} metadata updated: ${changesSummary}`;
        if (oldCellId) {
            msg += ` (ID changed from "${oldCellId}" to "${cellId}")`;
        }
        return [{ type: 'text', text: msg }];
    },
};
export const connectServerTool = {
    definition: {
        name: 'connect_server',
        description: 'Connect to a Nebula server. All subsequent operations will use this connection. Use this to switch between different Nebula instances (e.g., local vs SSH-tunneled remote).',
        inputSchema: {
            type: 'object',
            properties: {
                base_url: { type: 'string', description: 'Nebula server URL (e.g., http://localhost:3000). If not provided, connects to the default configured URL.' },
            },
        },
        annotations: { destructiveHint: false },
    },
    async execute(params, client) {
        // This is handled specially by the MCP server
        // The client parameter here is not used - the MCP server creates a new client
        return { success: true, data: { url: params.base_url || 'default' } };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        return [{ type: 'text', text: `Connected to ${result.data.url}` }];
    },
};
export const startAgentSessionTool = {
    definition: {
        name: 'start_agent_session',
        description: 'Start an agent session, locking the notebook for agent use. The UI will show a locked indicator and prevent user edits. Always call end_agent_session when done. Use connect_server first if you need to work with a different Nebula instance.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                agent_id: { type: 'string', description: 'Optional identifier for this agent session' },
            },
            required: ['path'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const result = await client.startAgentSession(params.path, params.agent_id);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        // Print warning if previous session wasn't ended
        if (result.data?.warning) {
            console.warn(`[start_agent_session] ${result.data.warning}`);
        }
        return { success: true, data: { warning: result.data?.warning } };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        let msg = 'Agent session started - notebook locked';
        if (result.data?.warning) {
            msg += `\n⚠️ Warning: ${result.data.warning}`;
        }
        return [{ type: 'text', text: msg }];
    },
};
export const endAgentSessionTool = {
    definition: {
        name: 'end_agent_session',
        description: 'End an agent session, unlocking the notebook for user edits. Always call this when agent work is complete.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
            },
            required: ['path'],
        },
        annotations: { destructiveHint: false },
    },
    async execute(params, client) {
        const result = await client.endAgentSession(params.path);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return {
            success: true,
            data: {
                sessionDuration: result.data?.sessionDuration,
                warning: result.data?.warning,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const duration = result.data?.sessionDuration
            ? ` (duration: ${Math.round(result.data.sessionDuration / 1000)}s)`
            : '';
        let msg = `Agent session ended${duration} - notebook unlocked`;
        if (result.data?.warning) {
            msg += `\n⚠️ ${result.data.warning}`;
        }
        return [{ type: 'text', text: msg }];
    },
};
// =============================================================================
// Export all notebook tools
// =============================================================================
export const notebookTools = [
    readNotebookTool,
    readCellTool,
    readOutputTool,
    insertCellTool,
    updateCellTool,
    deleteCellTool,
    clearNotebookTool,
    moveCellTool,
    duplicateCellTool,
    searchCellsTool,
    updateMetadataTool,
    connectServerTool,
    startAgentSessionTool,
    endAgentSessionTool,
];
//# sourceMappingURL=notebook.js.map