/**
 * Notebook Tools
 *
 * Tools for reading, writing, and manipulating notebook cells.
 */

import type { Tool, ToolResult, MCPContent } from './types.js';
import type { NebulaClient } from '../notebook/client.js';
import type { NotebookCell, CellOutput } from '../types.js';
import { createAdaptivePoller } from '../utils/polling.js';

// =============================================================================
// Shared Utilities
// =============================================================================

function formatCellPreview(cell: NotebookCell, index: number): string {
  const typeTag = cell.type === 'code' ? '[code]' : '[md]';
  const execCount = cell.executionCount ? ` [${cell.executionCount}]` : '';
  const firstLine = cell.content.split('\n')[0].substring(0, 60);
  const moreLines = cell.content.split('\n').length > 1 ? '...' : '';
  return `${index}: ${typeTag} id="${cell.id}"${execCount} ${firstLine}${moreLines}`;
}

function formatOutputs(outputs: CellOutput[]): MCPContent {
  return outputs.map(o => {
    if (o.type === 'image') {
      return { type: 'image' as const, data: o.content, mimeType: 'image/png' };
    }
    const prefix = o.type === 'error' ? '[ERROR] ' : '';
    return { type: 'text' as const, text: prefix + o.content };
  });
}

// =============================================================================
// read_notebook
// =============================================================================

export interface ReadNotebookParams {
  path: string;
  include_outputs?: boolean;
  format?: 'brief' | 'detailed';
  // Truncation parameters for outputs (when include_outputs=true)
  max_lines?: number;
  max_chars?: number;
  // Separate limits for error outputs (tracebacks need more context)
  max_lines_error?: number;
  max_chars_error?: number;
}

export interface ReadNotebookResult {
  path: string;
  cells: NotebookCell[];
  totalCells: number;
}

export const readNotebookTool: Tool<ReadNotebookParams, ReadNotebookResult> = {
  definition: {
    name: 'read_notebook',
    description: 'Read all cells from a notebook. Use format="brief" for overview, "detailed" for full content. Outputs are included and truncated by default (100 lines for regular output, 200 lines for errors). Use include_outputs=false to exclude outputs entirely.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the notebook file (.ipynb)' },
        include_outputs: { type: 'boolean', description: 'Include cell outputs (default: true). Outputs are automatically truncated.' },
        format: { type: 'string', enum: ['brief', 'detailed'], description: 'Output format (default: brief)' },
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
    const result = await client.readNotebookViaRouter(params.path, {
      includeOutputs: params.include_outputs ?? true,  // Default to true
      maxLines: params.max_lines,
      maxChars: params.max_chars,
      maxLinesError: params.max_lines_error,
      maxCharsError: params.max_chars_error,
    });
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const notebook = result.data!;
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
    const { path, cells, totalCells } = result.data!;
    const lines = [`Notebook: ${path} (${totalCells} cells)\n`];
    cells.forEach((cell, i) => lines.push(formatCellPreview(cell, i)));
    return [{ type: 'text', text: lines.join('\n') }];
  },
};

// =============================================================================
// read_cell
// =============================================================================

export interface ReadCellParams {
  path: string;
  cell_index?: number;
  cell_id?: string;
}

export interface ReadCellResult {
  cell: NotebookCell;
  cellIndex: number;
}

export const readCellTool: Tool<ReadCellParams, ReadCellResult> = {
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
    const { cell, cellIndex } = result.data!;
    const execInfo = cell.executionCount ? ` execution #${cell.executionCount}` : '';
    return [{ type: 'text', text: `Cell ${cellIndex} [${cell.type}] id="${cell.id}"${execInfo}\n---\n${cell.content}` }];
  },
};

// =============================================================================
// read_output
// =============================================================================

export interface ReadOutputParams {
  path: string;
  cell_index?: number;
  cell_id?: string;
  output_offset?: number;
  max_wait?: number;
  wait_for_completion?: boolean;
  // Truncation parameters for regular outputs
  max_lines?: number;
  max_chars?: number;
  // Separate limits for error outputs (tracebacks need more context)
  max_lines_error?: number;
  max_chars_error?: number;
  line_offset?: number;
  save_to_file?: boolean;
}

export interface TruncatedOutput extends CellOutput {
  truncated?: boolean;
  truncation_reason?: string | null;
  total_lines?: number;
  total_chars?: number;
  returned_range?: {
    start_line: number;
    end_line: number;
    char_count: number;
  };
  temp_file?: string;
  temp_file_size?: number;
  is_binary?: boolean;
}

export interface ReadOutputResult {
  cellId: string;
  cellIndex: number;
  outputs: TruncatedOutput[];
  totalOutputs: number;
  temp_files?: string[];
}

export const readOutputTool: Tool<ReadOutputParams, ReadOutputResult> = {
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
      const allOutputs = result.data!.outputs;
      return {
        success: true,
        data: {
          cellId: result.data!.cellId,
          cellIndex: result.data!.cellIndex,
          outputs: offset > 0 ? allOutputs.slice(offset) : allOutputs,
          totalOutputs: allOutputs.length,
          temp_files: result.data!.temp_files,
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

      const allOutputs = result.data!.outputs;
      const offset = params.output_offset ?? 0;
      const newOutputs = offset > 0 ? allOutputs.slice(offset) : allOutputs;
      const executionStatus = result.data!.executionStatus;

      // Return on new output only when wait_for_completion is false
      if (!waitForCompletion && allOutputs.length > lastOutputCount) {
        return {
          success: true,
          data: {
            cellId: result.data!.cellId,
            cellIndex: result.data!.cellIndex,
            outputs: newOutputs,
            totalOutputs: allOutputs.length,
            temp_files: result.data!.temp_files,
          },
        };
      }

      // If backend provides execution status and it's no longer busy, return current outputs
      if (waitForCompletion && executionStatus && executionStatus !== 'busy') {
        return {
          success: true,
          data: {
            cellId: result.data!.cellId,
            cellIndex: result.data!.cellIndex,
            outputs: newOutputs,
            totalOutputs: allOutputs.length,
            temp_files: result.data!.temp_files,
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
    const allOutputs = finalResult.data!.outputs;
    return {
      success: true,
      data: {
        cellId: finalResult.data!.cellId,
        cellIndex: finalResult.data!.cellIndex,
        outputs: offset > 0 ? allOutputs.slice(offset) : allOutputs,
        totalOutputs: allOutputs.length,
        temp_files: finalResult.data!.temp_files,
      },
    };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { cellId, outputs, totalOutputs, temp_files } = result.data!;
    if (outputs.length === 0) {
      return [{ type: 'text', text: `Cell ${cellId}: No outputs (total: ${totalOutputs})` }];
    }

    const mcpOutputs: MCPContent = [];
    let headerInfo = `Cell ${cellId}: ${outputs.length} outputs (total: ${totalOutputs})`;

    // Add temp file info if present
    if (temp_files && temp_files.length > 0) {
      headerInfo += `\n📁 Large output saved to: ${temp_files.join(', ')}`;
    }

    mcpOutputs.push({ type: 'text', text: headerInfo + '\n' });

    // Format each output with truncation metadata
    for (const output of outputs) {
      // Images are returned as-is (not affected by truncation limits)
      if (output.type === 'image') {
        mcpOutputs.push({ type: 'image' as const, data: output.content, mimeType: 'image/png' });
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

// =============================================================================
// insert_cell
// =============================================================================

export interface InsertCellParams {
  path: string;
  cell_id: string;
  content: string;
  cell_type?: 'code' | 'markdown';
  position?: number;
}

export interface InsertCellResult {
  cellIndex: number;
  cellId: string;
  idModified?: boolean;
  requestedId?: string;
}

export const insertCellTool: Tool<InsertCellParams, InsertCellResult> = {
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
    const { cellIndex, cellId, idModified, requestedId } = result.data!;
    let msg = `Inserted cell at index ${cellIndex}, id="${cellId}"`;
    if (idModified) {
      msg += ` (requested "${requestedId}" was auto-fixed)`;
    }
    return [{ type: 'text', text: msg }];
  },
};

// =============================================================================
// update_cell
// =============================================================================

export interface UpdateCellParams {
  path: string;
  cell_id: string;
  content?: string;
  cell_type?: 'code' | 'markdown';
}

export interface UpdateCellResult {
  cellIndex: number;
  cellId: string;
}

export const updateCellTool: Tool<UpdateCellParams, UpdateCellResult> = {
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
      data: { cellIndex: readResult.data!.cellIndex, cellId: cell_id },
    };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { cellIndex, cellId } = result.data!;
    return [{ type: 'text', text: `Updated cell at index ${cellIndex}, id="${cellId}"` }];
  },
};

// =============================================================================
// delete_cell
// =============================================================================

export interface DeleteCellParams {
  path: string;
  cell_index?: number;
  cell_id?: string;
}

export const deleteCellTool: Tool<DeleteCellParams, void> = {
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

// =============================================================================
// clear_notebook
// =============================================================================

export interface ClearNotebookParams {
  path: string;
}

export interface ClearNotebookResult {
  deletedCount: number;
}

export const clearNotebookTool: Tool<ClearNotebookParams, ClearNotebookResult> = {
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
        deletedCount: result.data!.deletedCount
      }
    };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { deletedCount } = result.data!;
    if (deletedCount === 0) {
      return [{ type: 'text', text: 'Notebook was already empty' }];
    }
    return [{ type: 'text', text: `Cleared notebook: deleted ${deletedCount} cells` }];
  },
};

// =============================================================================
// move_cell
// =============================================================================

export interface MoveCellParams {
  path: string;
  from_index?: number;
  to_index?: number;
  cell_id?: string;
  after_cell_id?: string;
}

export interface MoveCellResult {
  cellId?: string;
  fromIndex: number;
  toIndex: number;
}

export const moveCellTool: Tool<MoveCellParams, MoveCellResult> = {
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

    const result = await client.moveCellOp(
      path,
      from_index ?? 0,
      to_index ?? 0,
      { cellId: cell_id, afterCellId: after_cell_id }
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data! };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { cellId, fromIndex, toIndex } = result.data!;
    const idInfo = cellId ? ` (id="${cellId}")` : '';
    return [{ type: 'text', text: `Cell moved from index ${fromIndex} to ${toIndex}${idInfo}` }];
  },
};

// =============================================================================
// duplicate_cell
// =============================================================================

export interface DuplicateCellParams {
  path: string;
  cell_index: number;
}

export interface DuplicateCellResult {
  newCellIndex: number;
  totalCells: number;
}

export const duplicateCellTool: Tool<DuplicateCellParams, DuplicateCellResult> = {
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
    const totalCells = result.data!.metadata?.totalCells ?? result.data!.cellIndex + 1;

    return {
      success: true,
      data: {
        newCellIndex: result.data!.cellIndex,
        totalCells,
      },
    };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { newCellIndex, totalCells } = result.data!;
    return [{ type: 'text', text: `Cell duplicated at index ${newCellIndex} (${totalCells} cells total)` }];
  },
};

// =============================================================================
// search_cells
// =============================================================================

export interface SearchCellsParams {
  path: string;
  query: string;
  include_outputs?: boolean;
  limit?: number;
}

export interface SearchCellsResult {
  query: string;
  matchCount: number;
  matches: Array<{
    cellId: string;
    cellIndex: number;
    matchLocation: 'source' | 'output';
    matchLine?: number;
    outputIndex?: number;
    outputType?: string;
    preview: string;
  }>;
  hasMore: boolean;
}

export const searchCellsTool: Tool<SearchCellsParams, SearchCellsResult> = {
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
    const { matches, matchCount, hasMore } = result.data!;
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

// =============================================================================
// update_metadata
// =============================================================================

export interface UpdateMetadataParams {
  path: string;
  cell_id: string;
  changes: Record<string, unknown>;
}

export interface UpdateMetadataResult {
  cellId: string;
  cellIndex: number;
  changes: Record<string, { old: unknown; new: unknown }>;
  oldCellId?: string;
}

export const updateMetadataTool: Tool<UpdateMetadataParams, UpdateMetadataResult> = {
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
    const oldCell = beforeResult.data!.cell;
    const cellIndex = beforeResult.data!.cellIndex;

    // Apply the update
    const result = await client.updateMetadataOp(params.path, params.cell_id, params.changes);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Compute changes from requested changes and old values
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const oldCellId = 'id' in params.changes ? params.cell_id : undefined;
    let newCellId = params.cell_id;

    for (const [key, newValue] of Object.entries(params.changes)) {
      const oldValue = (oldCell as unknown as Record<string, unknown>)[key];
      changes[key] = { old: oldValue, new: newValue };
      if (key === 'id') {
        newCellId = newValue as string;
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
    const { cellIndex, changes, oldCellId, cellId } = result.data!;
    const changesSummary = Object.entries(changes)
      .map(([k, v]) => `${k}: ${JSON.stringify((v as {old: unknown; new: unknown}).old)} → ${JSON.stringify((v as {old: unknown; new: unknown}).new)}`)
      .join(', ');
    let msg = `Cell ${cellIndex} metadata updated: ${changesSummary}`;
    if (oldCellId) {
      msg += ` (ID changed from "${oldCellId}" to "${cellId}")`;
    }
    return [{ type: 'text', text: msg }];
  },
};

// =============================================================================
// start_agent_session
// =============================================================================

// =============================================================================
// connect_server
// =============================================================================

export interface ConnectServerParams {
  base_url?: string;
}

export interface ConnectServerResult {
  url: string;
}

export const connectServerTool: Tool<ConnectServerParams, ConnectServerResult> = {
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
    return [{ type: 'text', text: `Connected to ${result.data!.url}` }];
  },
};

// =============================================================================
// start_agent_session
// =============================================================================

export interface StartAgentSessionParams {
  path: string;
  agent_id?: string;
}

export interface StartAgentSessionResult {
  warning?: string;
}

export const startAgentSessionTool: Tool<StartAgentSessionParams, StartAgentSessionResult> = {
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

// =============================================================================
// end_agent_session
// =============================================================================

export interface EndAgentSessionParams {
  path: string;
}

export interface EndAgentSessionResult {
  sessionDuration?: number;
  warning?: string;
}

export const endAgentSessionTool: Tool<EndAgentSessionParams, EndAgentSessionResult> = {
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
// delete_cells (batch)
// =============================================================================

export interface DeleteCellsParams {
  path: string;
  cell_ids: string[];
}

export interface DeleteCellsResult {
  deletedCount: number;
  deletedIds: string[];
  notFound?: string[];
  totalCells: number;
}

export const deleteCellsTool: Tool<DeleteCellsParams, DeleteCellsResult> = {
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

    const result = await client.deleteCellsOp(params.path, params.cell_ids);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { deletedCount, deletedIds, notFound, totalCells } = result.data!;
    let msg = `Deleted ${deletedCount} cells: ${deletedIds.join(', ')}`;
    if (notFound && notFound.length > 0) {
      msg += `\n⚠️ Not found: ${notFound.join(', ')}`;
    }
    msg += ` (${totalCells} cells remaining)`;
    return [{ type: 'text', text: msg }];
  },
};

// =============================================================================
// insert_cells (batch)
// =============================================================================

export interface InsertCellsParams {
  path: string;
  cells: Array<{
    id?: string;
    type?: 'code' | 'markdown';
    content: string;
  }>;
  position?: number;
}

export interface InsertCellsResult {
  insertedCount: number;
  insertedIds: string[];
  startIndex: number;
  totalCells: number;
}

export const insertCellsTool: Tool<InsertCellsParams, InsertCellsResult> = {
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

    const result = await client.insertCellsOp(params.path, params.cells, params.position ?? -1);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { insertedCount, insertedIds, startIndex, totalCells } = result.data!;
    return [{ type: 'text', text: `Inserted ${insertedCount} cells at index ${startIndex}: ${insertedIds.join(', ')} (${totalCells} cells total)` }];
  },
};

// =============================================================================
// clear_outputs
// =============================================================================

export interface ClearOutputsParams {
  path: string;
  cell_ids?: string[];
}

export interface ClearOutputsResult {
  clearedCount: number;
  clearedIds: string[];
  notFound?: string[];
}

export const clearOutputsTool: Tool<ClearOutputsParams, ClearOutputsResult> = {
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
    const result = await client.clearOutputsOp(params.path, params.cell_ids);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { clearedCount, clearedIds, notFound } = result.data!;
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
  clearNotebookTool,
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
