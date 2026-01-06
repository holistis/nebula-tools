/**
 * Notebook Operations Tools
 *
 * Tools for reading, writing, and searching notebook cells.
 */

import type { Tool } from '../types.js';
import type { NebulaClient } from '../../notebook/client.js';
import { successResponse, errorResponse, formatOutputs, truncateWithHeadTail } from '../utils.js';

export const notebookTools: Tool[] = [
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
    description: 'Read a specific cell by index with its outputs',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the notebook file',
        },
        cell_index: {
          type: 'number',
          description: 'Cell index (0-based)',
        },
        include_outputs: {
          type: 'boolean',
          description: 'Include cell outputs (default: true)',
          default: true,
        },
      },
      required: ['path', 'cell_index'],
    },
  },
  {
    name: 'notebook_write_cell',
    description: 'Insert or update a cell in a notebook',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the notebook file',
        },
        cell_index: {
          type: 'number',
          description: 'Cell index to update, or -1 to append',
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

export async function handleNotebookTool(
  name: string,
  args: Record<string, unknown>,
  client: NebulaClient
): Promise<{ content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean }> {
  switch (name) {
    case 'read_notebook': {
      const path = args.path as string;
      const includeOutputs = (args.include_outputs as boolean) ?? false;
      const format = (args.format as string) ?? 'brief';

      const result = await client.readNotebook(path);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to read notebook');
      }

      const notebook = result.data!;
      const lines: string[] = [`Notebook: ${path} (${notebook.cells.length} cells)\n`];

      notebook.cells.forEach((cell, i) => {
        const typeIndicator = cell.type === 'code' ? '[code]' : '[md]';
        const execCount = cell.executionCount ? ` [${cell.executionCount}]` : '';

        if (format === 'brief') {
          const firstLine = cell.content.split('\n')[0].substring(0, 60);
          const lineCount = cell.content.split('\n').length;
          lines.push(`${i}: ${typeIndicator}${execCount} ${firstLine}${lineCount > 1 ? ` (+${lineCount - 1} lines)` : ''}`);
        } else {
          lines.push(`--- Cell ${i} ${typeIndicator}${execCount} ---`);
          lines.push(truncateWithHeadTail(cell.content, 50));

          if (includeOutputs && cell.outputs && cell.outputs.length > 0) {
            lines.push('Output:');
            cell.outputs.forEach((o) => {
              if (o.type === 'image') {
                lines.push('  [Image]');
              } else {
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
      const path = args.path as string;
      const cellIndex = args.cell_index as number;
      const includeOutputs = (args.include_outputs as boolean) ?? true;

      const result = await client.readNotebook(path);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to read notebook');
      }

      const notebook = result.data!;
      if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
        return errorResponse(`Cell index ${cellIndex} out of range (0-${notebook.cells.length - 1})`);
      }

      const cell = notebook.cells[cellIndex];
      const lines: string[] = [
        `Cell ${cellIndex} [${cell.type}]${cell.executionCount ? ` execution #${cell.executionCount}` : ''}`,
        '---',
        cell.content,
      ];

      if (includeOutputs && cell.outputs && cell.outputs.length > 0) {
        lines.push('---', 'Outputs:');

        const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
          { type: 'text', text: lines.join('\n') },
        ];

        // Add outputs (including images)
        content.push(...formatOutputs(cell.outputs));
        return { content };
      }

      return successResponse(lines.join('\n'));
    }

    case 'notebook_write_cell': {
      const path = args.path as string;
      const cellIndex = args.cell_index as number;
      const content = args.content as string;
      const cellType = (args.cell_type as 'code' | 'markdown') ?? 'code';

      const result = await client.writeCell(path, cellIndex, content, cellType);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to write cell');
      }

      const action = cellIndex === -1 ? 'appended' : 'updated';
      return successResponse(`Cell ${action} at index ${result.data?.cellIndex ?? cellIndex}`);
    }

    case 'notebook_delete_cell': {
      const path = args.path as string;
      const cellIndex = args.cell_index as number;

      const result = await client.deleteCell(path, cellIndex);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to delete cell');
      }

      return successResponse(`Cell ${cellIndex} deleted`);
    }

    case 'search_cells': {
      const path = args.path as string;
      const query = args.query as string;
      const limit = (args.limit as number) ?? 5;

      const result = await client.searchCells(path, query, limit);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to search cells');
      }

      const matches = result.data?.cells ?? [];
      if (matches.length === 0) {
        return successResponse(`No cells matching "${query}" found`);
      }

      const lines: string[] = [`Found ${matches.length} cells matching "${query}":\n`];
      matches.forEach((match: { index: number; score: number; type: string; content: string }) => {
        const preview = match.content.split('\n')[0].substring(0, 80);
        lines.push(`Cell ${match.index} [${match.type}] (score: ${match.score.toFixed(1)})`);
        lines.push(`  ${preview}${match.content.length > 80 ? '...' : ''}`);
      });

      return successResponse(lines.join('\n'));
    }

    case 'notebook_move_cell': {
      const path = args.path as string;
      const fromIndex = args.from_index as number;
      const toIndex = args.to_index as number;

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
      const path = args.path as string;
      const cellIndex = args.cell_index as number;

      const result = await client.duplicateCell(path, cellIndex);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to duplicate cell');
      }

      return successResponse(`Cell ${cellIndex} duplicated at position ${result.data!.newCellIndex} (${result.data!.totalCells} cells total)`);
    }

    default:
      return errorResponse(`Unknown notebook tool: ${name}`);
  }
}
