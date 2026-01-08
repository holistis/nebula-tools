/**
 * Notebook Tools
 *
 * Tools for reading, writing, and manipulating notebook cells.
 */

import type { Tool, ToolResult, MCPContent } from './types.js';
import type { NebulaClient } from '../notebook/client.js';
import type { NotebookCell, CellOutput } from '../types.js';

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
}

export interface ReadNotebookResult {
  path: string;
  cells: NotebookCell[];
  totalCells: number;
}

export const readNotebookTool: Tool<ReadNotebookParams, ReadNotebookResult> = {
  definition: {
    name: 'read_notebook',
    description: 'Read all cells from a notebook. Use format="brief" for overview, "detailed" for full content.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the notebook file (.ipynb)' },
        include_outputs: { type: 'boolean', description: 'Include cell outputs (default: false)' },
        format: { type: 'string', enum: ['brief', 'detailed'], description: 'Output format (default: brief)' },
      },
      required: ['path'],
    },
    annotations: { readOnlyHint: true },
  },

  async execute(params, client) {
    const result = await client.readNotebookViaRouter(params.path);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const notebook = result.data!;
    return {
      success: true,
      data: {
        path: params.path,
        cells: params.include_outputs ? notebook.cells : notebook.cells.map(c => ({ ...c, outputs: undefined })),
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
}

export interface ReadOutputResult {
  cellId: string;
  cellIndex: number;
  outputs: CellOutput[];
  totalOutputs: number;
}

export const readOutputTool: Tool<ReadOutputParams, ReadOutputResult> = {
  definition: {
    name: 'read_output',
    description: 'Read cell outputs. Use output_offset to skip already-seen outputs. Use max_wait to poll for new outputs.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the notebook file' },
        cell_index: { type: 'number', description: 'Cell index (0-based). Use this OR cell_id.' },
        cell_id: { type: 'string', description: 'Stable cell ID. Use this OR cell_index.' },
        output_offset: { type: 'number', description: 'Skip first N outputs (default: 0)' },
        max_wait: { type: 'number', description: 'Wait up to N seconds for new outputs (default: 0)' },
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

    // For immediate reads, use efficient operation router
    if (maxWait <= 0) {
      const result = await client.readCellOutputOp(params.path, {
        cellIndex: params.cell_index,
        cellId: params.cell_id,
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
        },
      };
    }

    // For polling, use the method that reads repeatedly
    const result = await client.readOutput(params.path, {
      cellIndex: params.cell_index,
      cellId: params.cell_id,
      outputOffset: params.output_offset,
      maxWait,
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
    const { cellId, outputs, totalOutputs } = result.data!;
    if (outputs.length === 0) {
      return [{ type: 'text', text: `Cell ${cellId}: No outputs (total: ${totalOutputs})` }];
    }
    return [
      { type: 'text', text: `Cell ${cellId}: ${outputs.length} outputs (total: ${totalOutputs})\n` },
      ...formatOutputs(outputs),
    ];
  },
};

// =============================================================================
// write_cell
// =============================================================================

export interface WriteCellParams {
  path: string;
  cell_index: number;
  content: string;
  cell_type?: 'code' | 'markdown';
  cell_id?: string;
}

export interface WriteCellResult {
  cellIndex: number;
  cellId: string;
  idModified?: boolean;
  requestedId?: string;
}

export const writeCellTool: Tool<WriteCellParams, WriteCellResult> = {
  definition: {
    name: 'write_cell',
    description: 'Insert or update a cell. Use cell_index=-1 to append. Provide cell_id for new cells (will be auto-fixed if duplicate).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the notebook file' },
        cell_index: { type: 'number', description: 'Cell index to update, or -1 to append' },
        content: { type: 'string', description: 'Cell content' },
        cell_type: { type: 'string', enum: ['code', 'markdown'], description: 'Cell type (default: code)' },
        cell_id: { type: 'string', description: 'Cell ID for new cells (required when cell_index=-1)' },
      },
      required: ['path', 'cell_index', 'content'],
    },
    annotations: { destructiveHint: true },
  },

  async execute(params, client) {
    const { path, cell_index, content, cell_type = 'code', cell_id } = params;

    if (cell_index === -1 && !cell_id) {
      return { success: false, error: 'cell_id is required when creating new cells (cell_index=-1)' };
    }

    if (cell_index === -1) {
      // Insert new cell
      const result = await client.insertCellOp(path, -1, {
        id: cell_id!,
        type: cell_type,
        content,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, data: result.data };
    } else {
      // Update existing cell
      const result = await client.updateContentOp(path, cell_id || `index-${cell_index}`, content);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        data: { cellIndex: cell_index, cellId: cell_id || `index-${cell_index}` },
      };
    }
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { cellIndex, cellId, idModified, requestedId } = result.data!;
    let msg = `Cell at index ${cellIndex}, id="${cellId}"`;
    if (idModified) {
      msg += ` (requested "${requestedId}" was auto-fixed)`;
    }
    return [{ type: 'text', text: msg }];
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
// move_cell
// =============================================================================

export interface MoveCellParams {
  path: string;
  from_index: number;
  to_index: number;
}

export const moveCellTool: Tool<MoveCellParams, void> = {
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
    const result = await client.moveCell(params.path, params.from_index, params.to_index);
    return result.success ? { success: true } : { success: false, error: result.error };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    return [{ type: 'text', text: 'Cell moved' }];
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
    const result = await client.duplicateCell(params.path, params.cell_index);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
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
  limit?: number;
}

export interface SearchCellsResult {
  cells: Array<{ index: number; score: number; type: string; content: string; id: string }>;
  totalCells: number;
}

export const searchCellsTool: Tool<SearchCellsParams, SearchCellsResult> = {
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
    const { cells } = result.data!;
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

    const result = await client.updateCellMetadata(params.path, params.cell_id, params.changes);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { cellIndex, changes, oldCellId, cellId } = result.data!;
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

// =============================================================================
// Export all notebook tools
// =============================================================================

export const notebookTools = [
  readNotebookTool,
  readCellTool,
  readOutputTool,
  writeCellTool,
  deleteCellTool,
  moveCellTool,
  duplicateCellTool,
  searchCellsTool,
  updateMetadataTool,
];
