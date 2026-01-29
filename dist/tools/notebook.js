/**
 * Notebook Tools
 *
 * Tools for reading, writing, and manipulating notebook cells.
 */
import { createAdaptivePoller } from '../utils/polling.js';
import { resizeImageIfNeeded } from '../utils/imageResize.js';
// =============================================================================
// Shared Utilities
// =============================================================================
function formatCellPreview(cell, index) {
    const typeTag = cell.type === 'code' ? '[code]' : '[md]';
    const execCount = cell.executionCount ? ` [${cell.executionCount}]` : '';
    const firstLine = cell.content.split('\n')[0].substring(0, 60);
    const moreLines = cell.content.split('\n').length > 1 ? '...' : '';
    // Use #N format (1-indexed) to match UI display
    return `#${index + 1}: ${typeTag} id="${cell.id}"${execCount} ${firstLine}${moreLines}`;
}
async function formatOutputs(outputs) {
    const results = [];
    for (const o of outputs) {
        if (o.type === 'image') {
            // Resize images to fit Claude API limits (2000px max dimension)
            const resizedData = await resizeImageIfNeeded(o.content);
            results.push({ type: 'image', data: resizedData, mimeType: 'image/png' });
        }
        else {
            const prefix = o.type === 'error' ? '[ERROR] ' : '';
            results.push({ type: 'text', text: prefix + o.content });
        }
    }
    return results;
}
export const readNotebookTool = {
    definition: {
        name: 'read_notebook',
        description: 'Read all cells from a notebook. Formats: "brief" (one-line previews), "content" (full code, no outputs), "detailed" (full code + outputs, default). Outputs are truncated (100 lines regular, 200 lines errors).',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file (.ipynb)' },
                format: { type: 'string', enum: ['brief', 'content', 'detailed'], description: 'Output format: brief (previews), content (full code), detailed (code + outputs, default)' },
                include_outputs: { type: 'boolean', description: 'Override output inclusion (default: true for detailed, false for others)' },
                max_lines: { type: 'number', description: 'Max lines per regular output (default: 100)' },
                max_chars: { type: 'number', description: 'Max chars per regular output (default: 10000)' },
                max_lines_error: { type: 'number', description: 'Max lines per error output (default: 200)' },
                max_chars_error: { type: 'number', description: 'Max chars per error output (default: 20000)' },
            },
            required: ['path'],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        const format = params.format ?? 'detailed';
        // Default include_outputs based on format, but allow override
        const includeOutputs = params.include_outputs ?? (format === 'detailed');
        const result = await client.readNotebookViaRouter(params.path, {
            includeOutputs,
            maxLines: params.max_lines,
            maxChars: params.max_chars,
            maxLinesError: params.max_lines_error,
            maxCharsError: params.max_chars_error,
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
                backend: notebook.backend,
                format,
                includeOutputs,
            },
        };
    },
    async formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { path, cells, totalCells, format, includeOutputs } = result.data;
        // Brief format: just show previews
        if (format === 'brief') {
            const lines = [`Notebook: ${path} (${totalCells} cells)\n`];
            cells.forEach((cell, i) => lines.push(formatCellPreview(cell, i)));
            return [{ type: 'text', text: lines.join('\n') }];
        }
        // Content and Detailed formats: show full cell content
        const content = [];
        content.push({ type: 'text', text: `Notebook: ${path} (${totalCells} cells)\n` });
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const typeTag = cell.type === 'code' ? '[code]' : '[markdown]';
            const execCount = cell.executionCount ? ` In[${cell.executionCount}]` : '';
            // Cell header and content (use #N format, 1-indexed, to match UI display)
            const cellText = `\n${'─'.repeat(60)}\n#${i + 1} ${typeTag} id="${cell.id}"${execCount}\n${'─'.repeat(60)}\n${cell.content}`;
            content.push({ type: 'text', text: cellText });
            // Outputs (if included and present)
            if (includeOutputs && cell.outputs && cell.outputs.length > 0) {
                content.push({ type: 'text', text: `\n--- Output ---` });
                const outputContent = await formatOutputs(cell.outputs);
                content.push(...outputContent);
            }
        }
        return content;
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
        const execInfo = cell.executionCount ? ` execution [${cell.executionCount}]` : '';
        // Use #N format (1-indexed) to match UI display
        return [{ type: 'text', text: `#${cellIndex + 1} [${cell.type}] id="${cell.id}"${execInfo}\n---\n${cell.content}` }];
    },
};
export const readOutputTool = {
    definition: {
        name: 'read_output',
        description: `Read cell outputs. By default waits for completion or max_wait timeout (returns once). Set wait_for_completion=false to return as soon as new output appears. Regular outputs truncated to 100 lines, errors get 200 lines. Use save_to_file=true for complete output.`,
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_index: { type: 'number', description: 'Cell index (0-based). Use this OR cell_id.' },
                cell_id: { type: 'string', description: 'Stable cell ID. Use this OR cell_index.' },
                output_offset: { type: 'number', description: 'Skip first N outputs (default: 0)' },
                max_wait: { type: 'number', description: 'Wait up to N seconds for completion or timeout (default: 60). Set 0 for immediate read.' },
                wait_for_completion: { type: 'boolean', description: 'Wait for completion or timeout (default: true). If false, return on new output.' },
                max_lines: { type: 'number', description: 'Max lines per regular output (default: 100)' },
                max_chars: { type: 'number', description: 'Max chars per regular output (default: 10000)' },
                max_lines_error: { type: 'number', description: 'Max lines per error output (default: 200)' },
                max_chars_error: { type: 'number', description: 'Max chars per error output (default: 20000)' },
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
        const waitForCompletion = params.wait_for_completion ?? true;
        const maxWait = params.max_wait ?? (waitForCompletion ? 60 : 0);
        // Build truncation options
        const truncationOpts = {
            maxLines: params.max_lines,
            maxChars: params.max_chars,
            maxLinesError: params.max_lines_error,
            maxCharsError: params.max_chars_error,
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
            const executionStatus = result.data.executionStatus;
            // Return on new output only when wait_for_completion is false
            if (!waitForCompletion && allOutputs.length > lastOutputCount) {
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
            // If backend provides execution status and it's no longer busy, return current outputs
            if (waitForCompletion && executionStatus && executionStatus !== 'busy') {
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
    async formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { cellId, cellIndex, outputs, totalOutputs, temp_files } = result.data;
        // Use #N format (1-indexed) to match UI display
        const cellRef = `#${cellIndex + 1} (id="${cellId}")`;
        if (outputs.length === 0) {
            return [{ type: 'text', text: `${cellRef}: No outputs (total: ${totalOutputs})` }];
        }
        const mcpOutputs = [];
        let headerInfo = `${cellRef}: ${outputs.length} outputs (total: ${totalOutputs})`;
        // Add temp file info if present
        if (temp_files && temp_files.length > 0) {
            headerInfo += `\n📁 Large output saved to: ${temp_files.join(', ')}`;
        }
        mcpOutputs.push({ type: 'text', text: headerInfo + '\n' });
        // Format each output with truncation metadata
        for (const output of outputs) {
            // Images are resized to fit Claude API limits (2000px max dimension)
            if (output.type === 'image') {
                const resizedData = await resizeImageIfNeeded(output.content);
                mcpOutputs.push({ type: 'image', data: resizedData, mimeType: 'image/png' });
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
        let msg = `Inserted cell at #${cellIndex + 1}, id="${cellId}"`;
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
        return [{ type: 'text', text: `Updated cell #${cellIndex + 1}, id="${cellId}"` }];
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
export const createNotebookTool = {
    definition: {
        name: 'create_notebook',
        description: 'Create a new empty notebook. If the notebook is open in the browser UI, it will attempt to open the new notebook in a new tab.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path for the new notebook file (.ipynb)' },
                overwrite: { type: 'boolean', description: 'Allow overwriting existing file (default: false)' },
                kernel_name: { type: 'string', description: 'Kernel name (default: python3)' },
                kernel_display_name: { type: 'string', description: 'Display name for kernel (default: Python 3)' },
            },
            required: ['path'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const result = await client.createNotebookOp(params.path, {
            overwrite: params.overwrite,
            kernelName: params.kernel_name,
            kernelDisplayName: params.kernel_display_name,
        });
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return {
            success: true,
            data: {
                path: result.data?.path ?? params.path,
                mtime: result.data?.mtime,
                popupBlocked: result.data?.popupBlocked,
                popupMessage: result.data?.popupMessage,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { path, popupBlocked, popupMessage } = result.data;
        let msg = `Created notebook: ${path}`;
        if (popupBlocked && popupMessage) {
            msg += `\n⚠️ ${popupMessage}`;
        }
        return [{ type: 'text', text: msg }];
    },
};
export const moveCellTool = {
    definition: {
        name: 'move_cell',
        description: 'Move a cell from one position to another. Supports two modes: by index (from_index, to_index) or by ID (cell_id with after_cell_id or to_index=-1 for start).',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                from_index: { type: 'number', description: 'Current cell index (0-based). Use this OR cell_id.' },
                to_index: { type: 'number', description: 'Target cell index (0-based). Use -1 to move to start.' },
                cell_id: { type: 'string', description: 'ID of cell to move. Use this OR from_index.' },
                after_cell_id: { type: 'string', description: 'Move after this cell ID. Alternative to to_index.' },
            },
            required: ['path'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const { path, from_index, to_index, cell_id, after_cell_id } = params;
        // Validate parameters
        if (from_index === undefined && !cell_id) {
            return { success: false, error: 'Must provide from_index or cell_id' };
        }
        if (to_index === undefined && !after_cell_id) {
            return { success: false, error: 'Must provide to_index or after_cell_id' };
        }
        const result = await client.moveCellOp(path, from_index ?? 0, to_index ?? 0, { cellId: cell_id, afterCellId: after_cell_id });
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { cellId, fromIndex, toIndex } = result.data;
        const idInfo = cellId ? ` (id="${cellId}")` : '';
        return [{ type: 'text', text: `Cell moved from #${fromIndex + 1} to #${toIndex + 1}${idInfo}` }];
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
        return [{ type: 'text', text: `Cell duplicated at #${newCellIndex + 1} (${totalCells} cells total)` }];
    },
};
export const searchCellsTool = {
    definition: {
        name: 'search_cells',
        description: 'Search notebook cells by keyword. Can search in cell source code and optionally in outputs.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                query: { type: 'string', description: 'Search query (keywords)' },
                include_outputs: { type: 'boolean', description: 'Also search in cell outputs (default: false)' },
                limit: { type: 'number', description: 'Maximum results (default: 10)' },
            },
            required: ['path', 'query'],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        const result = await client.searchCellsOp(params.path, params.query, {
            includeOutputs: params.include_outputs,
            limit: params.limit,
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
        const { matches, matchCount, hasMore } = result.data;
        if (matches.length === 0) {
            return [{ type: 'text', text: 'No matching cells found' }];
        }
        const lines = [`Found ${matchCount} matches:\n`];
        matches.forEach(m => {
            const location = m.matchLocation === 'output'
                ? `output[${m.outputIndex}] (${m.outputType})`
                : `source${m.matchLine !== undefined ? `:${m.matchLine}` : ''}`;
            lines.push(`Cell ${m.cellIndex} [${location}] id="${m.cellId}"`);
            lines.push(`  ${m.preview}`);
        });
        if (hasMore) {
            lines.push(`\n(more results available, increase limit)`);
        }
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
        description: `Connect to a Nebula server. Call this ONCE at the start of your session if you need to use a non-default server (e.g., SSH-tunneled remote). All subsequent operations will use this connection.

RECOMMENDED WORKFLOW:
1. connect_server (once, if needed for non-default URL)
2. For each response: start_agent_session → operations → end_agent_session`,
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
        description: `Start an agent session, locking the notebook for agent use. The UI will show a locked indicator and prevent user edits. Always call end_agent_session when done. IMPORTANT: call connect_server first if you're not sure you're on the correct Nebula URL (tools default to NEBULA_URL or http://localhost:3000).

This call validates that the notebook path exists; it will error if the path is wrong or missing.

IMPORTANT: Call this at the START of each response before any notebook operations, and call end_agent_session at the END of each response. This ensures the notebook is only locked while you're actively working on it.

Example flow for each response:
  start_agent_session → insert_cell/update_cell/execute_cell/etc → end_agent_session

FORCE OPTION (use only with explicit user permission):
If a previous agent session was not properly ended (e.g., due to a crash or timeout), the notebook may remain locked. Use force=true ONLY when the user explicitly asks you to "force" or "steal" the lock. This will forcibly end any existing session and start a new one.`,
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                agent_id: { type: 'string', description: 'Optional identifier for this agent session' },
                force: {
                    type: 'boolean',
                    description: 'DANGEROUS: Force steal the lock even if another session is active. Use ONLY with explicit user permission to avoid disrupting another agent. Default: false',
                },
            },
            required: ['path'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const result = await client.startAgentSession(params.path, params.agent_id, params.force);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        // Print warning if previous session wasn't ended
        if (result.data?.warning) {
            console.warn(`[start_agent_session] ${result.data.warning}`);
        }
        return {
            success: true,
            data: {
                warning: result.data?.warning,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        let msg = 'Agent session started - notebook locked';
        if (result.data?.warning) {
            msg += `\n⚠️ ${result.data.warning}`;
        }
        return [{ type: 'text', text: msg }];
    },
};
export const endAgentSessionTool = {
    definition: {
        name: 'end_agent_session',
        description: `End an agent session, unlocking the notebook for user edits. Always call this at the END of each response after completing all notebook operations.

IMPORTANT: Always call this before finishing your response, even if operations failed. This ensures the notebook is unlocked for the user.`,
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
export const deleteCellsTool = {
    definition: {
        name: 'delete_cells',
        description: 'Delete multiple cells by ID in a single operation. More efficient than multiple single deletes.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of cell IDs to delete',
                },
            },
            required: ['path', 'cell_ids'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        if (!params.cell_ids || params.cell_ids.length === 0) {
            return { success: false, error: 'Must provide at least one cell ID' };
        }
        // Implement as a series of delete_cell calls (shorthand at MCP level, no server-side batch needed)
        const deletedIds = [];
        const notFound = [];
        for (const cellId of params.cell_ids) {
            const result = await client.deleteCellOp(params.path, { cellId });
            if (result.success) {
                deletedIds.push(cellId);
            }
            else if (result.error?.includes('not found')) {
                notFound.push(cellId);
            }
            else {
                // Stop on first real error
                return {
                    success: false,
                    error: `Failed to delete cell ${cellId}: ${result.error}`,
                    data: { deletedCount: deletedIds.length, deletedIds, notFound, totalCells: -1 },
                };
            }
        }
        // Get final cell count
        const notebook = await client.readNotebookViaRouter(params.path);
        const totalCells = notebook.success ? notebook.data.cells.length : -1;
        return {
            success: true,
            data: {
                deletedCount: deletedIds.length,
                deletedIds,
                notFound: notFound.length > 0 ? notFound : undefined,
                totalCells,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { deletedCount, deletedIds, notFound, totalCells } = result.data;
        let msg = `Deleted ${deletedCount} cell${deletedCount !== 1 ? 's' : ''}: ${deletedIds.join(', ')}`;
        if (notFound && notFound.length > 0) {
            msg += `\n⚠️ Not found: ${notFound.join(', ')}`;
        }
        msg += ` (${totalCells} cell${totalCells !== 1 ? 's' : ''} remaining)`;
        return [{ type: 'text', text: msg }];
    },
};
export const insertCellsTool = {
    definition: {
        name: 'insert_cells',
        description: 'Insert multiple cells at a position in a single operation. More efficient than multiple single inserts.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cells: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Array of cells to insert. Each cell: {id?: string, type?: "code"|"markdown", content: string}',
                },
                position: { type: 'number', description: 'Position to insert at (0-based). Use -1 or omit to append at end.' },
            },
            required: ['path', 'cells'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        if (!params.cells || params.cells.length === 0) {
            return { success: false, error: 'Must provide at least one cell' };
        }
        // Implement as a series of insert_cell calls (shorthand at MCP level, no server-side batch needed)
        const insertedIds = [];
        let startIndex = params.position ?? -1;
        // If appending (-1), get current cell count to determine start index
        if (startIndex === -1) {
            const notebook = await client.readNotebookViaRouter(params.path);
            if (!notebook.success) {
                return { success: false, error: `Failed to read notebook: ${notebook.error}` };
            }
            startIndex = notebook.data.cells.length;
        }
        // Insert cells in order at consecutive positions
        for (let i = 0; i < params.cells.length; i++) {
            const cellData = params.cells[i];
            const cellId = cellData.id || `cell-${Date.now()}-${i}`;
            const cell = {
                id: cellId,
                type: (cellData.type || 'code'),
                content: cellData.content,
            };
            const result = await client.insertCellOp(params.path, startIndex + i, cell);
            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to insert cell ${i + 1}: ${result.error}`,
                    data: { insertedCount: insertedIds.length, insertedIds, startIndex, totalCells: -1 },
                };
            }
            insertedIds.push(result.data.cellId);
        }
        // Get final cell count
        const notebook = await client.readNotebookViaRouter(params.path);
        const totalCells = notebook.success ? notebook.data.cells.length : -1;
        return {
            success: true,
            data: {
                insertedCount: insertedIds.length,
                insertedIds,
                startIndex,
                totalCells,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { insertedCount, insertedIds, startIndex, totalCells } = result.data;
        return [{ type: 'text', text: `Inserted ${insertedCount} cell${insertedCount !== 1 ? 's' : ''} at #${startIndex + 1}: ${insertedIds.join(', ')} (${totalCells} cell${totalCells !== 1 ? 's' : ''} total)` }];
    },
};
export const clearOutputsTool = {
    definition: {
        name: 'clear_outputs',
        description: 'Clear outputs from cells without re-executing. If no cell_ids provided, clears all cell outputs. Useful for cleanup before sharing notebooks.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the notebook file' },
                cell_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional array of cell IDs to clear. If omitted, clears all cells.',
                },
            },
            required: ['path'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        // Implement as updateOutputsOp calls with empty outputs (shorthand at MCP level)
        const notebook = await client.readNotebookViaRouter(params.path);
        if (!notebook.success) {
            return { success: false, error: `Failed to read notebook: ${notebook.error}` };
        }
        const cells = notebook.data.cells;
        const clearedIds = [];
        const notFound = [];
        // Determine which cells to clear
        let targetCellIds;
        if (params.cell_ids && params.cell_ids.length > 0) {
            targetCellIds = params.cell_ids;
        }
        else {
            // Clear all code cells (markdown cells don't have outputs)
            targetCellIds = cells.filter(c => c.type === 'code').map(c => c.id);
        }
        for (const cellId of targetCellIds) {
            const cell = cells.find(c => c.id === cellId);
            if (!cell) {
                notFound.push(cellId);
                continue;
            }
            // Skip if no outputs to clear
            if (!cell.outputs || cell.outputs.length === 0) {
                continue;
            }
            const result = await client.updateOutputsOp(params.path, cellId, []);
            if (result.success) {
                clearedIds.push(cellId);
            }
            // Silently ignore failures for individual cells
        }
        return {
            success: true,
            data: {
                clearedCount: clearedIds.length,
                clearedIds,
                notFound: notFound.length > 0 ? notFound : undefined,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { clearedCount, clearedIds, notFound } = result.data;
        if (clearedCount === 0) {
            return [{ type: 'text', text: 'No outputs to clear' }];
        }
        let msg = `Cleared outputs from ${clearedCount} cells`;
        if (clearedIds.length <= 5) {
            msg += `: ${clearedIds.join(', ')}`;
        }
        if (notFound && notFound.length > 0) {
            msg += `\n⚠️ Not found: ${notFound.join(', ')}`;
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
    createNotebookTool,
    moveCellTool,
    duplicateCellTool,
    searchCellsTool,
    updateMetadataTool,
    connectServerTool,
    startAgentSessionTool,
    endAgentSessionTool,
    // Batch operations (Phase 1 enhancements)
    deleteCellsTool,
    insertCellsTool,
    clearOutputsTool,
];
//# sourceMappingURL=notebook.js.map