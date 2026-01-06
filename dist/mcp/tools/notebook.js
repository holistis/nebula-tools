/**
 * Notebook Operations Tools
 *
 * Tools for reading, writing, and searching notebook cells.
 */
import { successResponse, errorResponse, formatOutputs, truncateWithHeadTail } from '../utils.js';
export const notebookTools = [
    {
        name: 'read_notebook',
        description: 'Read all cells from a notebook with optional output inclusion',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file (.ipynb)',
                },
                include_outputs: {
                    type: 'boolean',
                    description: 'Include cell outputs in response (default: false)',
                    default: false,
                },
                format: {
                    type: 'string',
                    enum: ['brief', 'detailed'],
                    description: 'Output format: brief (first line + line count) or detailed (full content)',
                    default: 'brief',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'read_cell',
        description: 'Read a specific cell content and metadata (not outputs). Use read_output to get outputs.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file',
                },
                cell_index: {
                    type: 'number',
                    description: 'Cell index (0-based). Use this OR cell_id.',
                },
                cell_id: {
                    type: 'string',
                    description: 'Stable cell ID (from nebula_id metadata). Use this OR cell_index.',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'read_output',
        description: 'Read cell outputs for polling execution progress. Use output_offset to skip already-seen outputs. Use timeout to wait for new outputs.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file',
                },
                cell_index: {
                    type: 'number',
                    description: 'Cell index (0-based). Use this OR cell_id.',
                },
                cell_id: {
                    type: 'string',
                    description: 'Stable cell ID (from nebula_id metadata). Use this OR cell_index.',
                },
                output_offset: {
                    type: 'number',
                    description: 'Skip first N outputs (agent tracks this). Default: 0.',
                    default: 0,
                },
                max_wait: {
                    type: 'number',
                    description: 'Wait up to N seconds for new outputs beyond offset. Default: 0 (immediate read).',
                    default: 0,
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'notebook_write_cell',
        description: 'Insert or update a cell in a notebook. For new cells, provide a human-readable cell_id. If ID already exists, it will be auto-fixed (e.g., "my-cell" -> "my-cell-2").',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file',
                },
                cell_index: {
                    type: 'number',
                    description: 'Cell index to update, or -1 to append new cell',
                },
                cell_id: {
                    type: 'string',
                    description: 'Human-readable cell ID (required for new cells, i.e., cell_index=-1). Use descriptive names like "load-data" or "train-model".',
                },
                content: {
                    type: 'string',
                    description: 'Cell content (code or markdown)',
                },
                cell_type: {
                    type: 'string',
                    enum: ['code', 'markdown'],
                    description: 'Type of cell (default: code)',
                    default: 'code',
                },
            },
            required: ['path', 'cell_index', 'content'],
        },
    },
    {
        name: 'update_cell_metadata',
        description: 'Update cell metadata (id, type, scrolled, scrolledHeight). Validates against Nebula schema. Use to rename cell IDs or change cell properties.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file',
                },
                cell_id: {
                    type: 'string',
                    description: 'Current cell ID to update',
                },
                changes: {
                    type: 'object',
                    description: 'Metadata changes. Keys: id (new ID, auto-fixed if duplicate), type, scrolled, scrolledHeight',
                },
            },
            required: ['path', 'cell_id', 'changes'],
        },
    },
    {
        name: 'notebook_delete_cell',
        description: 'Delete a cell from a notebook',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file',
                },
                cell_index: {
                    type: 'number',
                    description: 'Cell index to delete (0-based)',
                },
            },
            required: ['path', 'cell_index'],
        },
    },
    {
        name: 'search_cells',
        description: 'Search notebook cells by keyword (useful for finding relevant context)',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file',
                },
                query: {
                    type: 'string',
                    description: 'Search query (keywords)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results (default: 5)',
                    default: 5,
                },
            },
            required: ['path', 'query'],
        },
    },
    {
        name: 'notebook_move_cell',
        description: 'Move a cell from one position to another within a notebook',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file',
                },
                from_index: {
                    type: 'number',
                    description: 'Current cell index (0-based)',
                },
                to_index: {
                    type: 'number',
                    description: 'Target cell index (0-based)',
                },
            },
            required: ['path', 'from_index', 'to_index'],
        },
    },
    {
        name: 'notebook_duplicate_cell',
        description: 'Duplicate a cell, inserting the copy immediately after the original',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the notebook file',
                },
                cell_index: {
                    type: 'number',
                    description: 'Cell index to duplicate (0-based)',
                },
            },
            required: ['path', 'cell_index'],
        },
    },
];
export async function handleNotebookTool(name, args, client) {
    switch (name) {
        case 'read_notebook': {
            const path = args.path;
            const includeOutputs = args.include_outputs ?? false;
            const format = args.format ?? 'brief';
            const result = await client.readNotebook(path);
            if (!result.success) {
                return errorResponse(result.error || 'Failed to read notebook');
            }
            const notebook = result.data;
            const lines = [`Notebook: ${path} (${notebook.cells.length} cells)\n`];
            notebook.cells.forEach((cell, i) => {
                const typeIndicator = cell.type === 'code' ? '[code]' : '[md]';
                const execCount = cell.executionCount ? ` [${cell.executionCount}]` : '';
                if (format === 'brief') {
                    const firstLine = cell.content.split('\n')[0].substring(0, 50);
                    const lineCount = cell.content.split('\n').length;
                    const lineInfo = lineCount > 1 ? ` (+${lineCount - 1} lines)` : '';
                    lines.push(`${i}: ${typeIndicator} id=${cell.id}${execCount} ${firstLine}${lineInfo}`);
                }
                else {
                    lines.push(`--- Cell ${i} ${typeIndicator} id=${cell.id}${execCount} ---`);
                    lines.push(truncateWithHeadTail(cell.content, 50));
                    if (includeOutputs && cell.outputs && cell.outputs.length > 0) {
                        lines.push('Output:');
                        cell.outputs.forEach((o) => {
                            if (o.type === 'image') {
                                lines.push('  [Image]');
                            }
                            else {
                                lines.push('  ' + truncateWithHeadTail(o.content, 20).split('\n').join('\n  '));
                            }
                        });
                    }
                    lines.push('');
                }
            });
            return successResponse(lines.join('\n'));
        }
        case 'read_cell': {
            const path = args.path;
            const cellIndex = args.cell_index;
            const cellId = args.cell_id;
            if (cellIndex === undefined && cellId === undefined) {
                return errorResponse('Must provide either cell_index or cell_id');
            }
            const result = await client.readCell(path, { cellIndex, cellId });
            if (!result.success) {
                return errorResponse(result.error || 'Failed to read cell');
            }
            const cell = result.data;
            const lines = [
                `Cell ${cell.cellIndex} [${cell.type}] id="${cell.cellId}"${cell.executionCount ? ` execution #${cell.executionCount}` : ''}`,
                '---',
                cell.content,
            ];
            return successResponse(lines.join('\n'));
        }
        case 'read_output': {
            const path = args.path;
            const cellIndex = args.cell_index;
            const cellId = args.cell_id;
            const outputOffset = args.output_offset ?? 0;
            const maxWait = args.max_wait ?? 0;
            if (cellIndex === undefined && cellId === undefined) {
                return errorResponse('Must provide either cell_index or cell_id');
            }
            const result = await client.readOutput(path, { cellIndex, cellId, outputOffset, maxWait });
            if (!result.success) {
                return errorResponse(result.error || 'Failed to read outputs');
            }
            const data = result.data;
            const outputs = data.outputs;
            if (outputs.length === 0) {
                if (data.totalOutputs === 0) {
                    return successResponse(`Cell ${data.cellId}: No outputs`);
                }
                return successResponse(`Cell ${data.cellId}: No new outputs (offset ${outputOffset}, total ${data.totalOutputs})`);
            }
            const content = [
                { type: 'text', text: `Cell ${data.cellId}: ${outputs.length} outputs (offset ${outputOffset}, total ${data.totalOutputs})\n` },
            ];
            content.push(...formatOutputs(outputs));
            return { content };
        }
        case 'notebook_write_cell': {
            const path = args.path;
            const cellIndex = args.cell_index;
            const content = args.content;
            const cellType = args.cell_type ?? 'code';
            const cellId = args.cell_id;
            // Require cell_id for new cells (appending)
            if (cellIndex === -1 && !cellId) {
                return errorResponse('cell_id is required when creating new cells (cell_index=-1). Use a descriptive name like "load-data" or "train-model".');
            }
            const result = await client.writeCell(path, cellIndex, content, cellType, cellId);
            if (!result.success) {
                return errorResponse(result.error || 'Failed to write cell');
            }
            const data = result.data;
            const action = cellIndex === -1 ? 'created' : 'updated';
            let msg = `Cell ${action} at index ${data.cellIndex}, id="${data.cellId}"`;
            if (data.idModified) {
                msg += ` (requested "${data.requestedId}" was auto-fixed due to conflict)`;
            }
            return successResponse(msg);
        }
        case 'update_cell_metadata': {
            const path = args.path;
            const cellId = args.cell_id;
            const changes = args.changes;
            if (!changes || Object.keys(changes).length === 0) {
                return errorResponse('No changes provided');
            }
            const result = await client.updateCellMetadata(path, cellId, changes);
            if (!result.success) {
                return errorResponse(result.error || 'Failed to update metadata');
            }
            const data = result.data;
            const changesSummary = Object.entries(data.changes)
                .map(([k, v]) => `${k}: ${JSON.stringify(v.old)} → ${JSON.stringify(v.new)}`)
                .join(', ');
            let msg = `Cell ${data.cellIndex} metadata updated: ${changesSummary}`;
            if (data.oldCellId) {
                msg += ` (ID changed from "${data.oldCellId}" to "${data.cellId}")`;
            }
            return successResponse(msg);
        }
        case 'notebook_delete_cell': {
            const path = args.path;
            const cellIndex = args.cell_index;
            const result = await client.deleteCell(path, cellIndex);
            if (!result.success) {
                return errorResponse(result.error || 'Failed to delete cell');
            }
            return successResponse(`Cell ${cellIndex} deleted`);
        }
        case 'search_cells': {
            const path = args.path;
            const query = args.query;
            const limit = args.limit ?? 5;
            const result = await client.searchCells(path, query, limit);
            if (!result.success) {
                return errorResponse(result.error || 'Failed to search cells');
            }
            const matches = result.data?.cells ?? [];
            if (matches.length === 0) {
                return successResponse(`No cells matching "${query}" found`);
            }
            const lines = [`Found ${matches.length} cells matching "${query}":\n`];
            matches.forEach((match) => {
                const preview = match.content.split('\n')[0].substring(0, 80);
                lines.push(`Cell ${match.index} [${match.type}] (score: ${match.score.toFixed(1)})`);
                lines.push(`  ${preview}${match.content.length > 80 ? '...' : ''}`);
            });
            return successResponse(lines.join('\n'));
        }
        case 'notebook_move_cell': {
            const path = args.path;
            const fromIndex = args.from_index;
            const toIndex = args.to_index;
            const result = await client.moveCell(path, fromIndex, toIndex);
            if (!result.success) {
                return errorResponse(result.error || 'Failed to move cell');
            }
            if (fromIndex === toIndex) {
                return successResponse(`Cell ${fromIndex} already at position ${toIndex} (no change)`);
            }
            return successResponse(`Cell moved from position ${fromIndex} to ${toIndex}`);
        }
        case 'notebook_duplicate_cell': {
            const path = args.path;
            const cellIndex = args.cell_index;
            const result = await client.duplicateCell(path, cellIndex);
            if (!result.success) {
                return errorResponse(result.error || 'Failed to duplicate cell');
            }
            return successResponse(`Cell ${cellIndex} duplicated at position ${result.data.newCellIndex} (${result.data.totalCells} cells total)`);
        }
        default:
            return errorResponse(`Unknown notebook tool: ${name}`);
    }
}
//# sourceMappingURL=notebook.js.map