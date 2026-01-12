/**
 * Execution Tools
 *
 * Tools for executing code in kernel sessions with streaming output.
 *
 * Truncation is handled by the backend (Python) for consistency with
 * read_notebook and read_output tools. After execution, outputs are
 * read back via readCellOutputOp which applies backend truncation.
 */

import type { Tool, ToolResult, MCPContent } from './types.js';
import type { NebulaClient } from '../notebook/client.js';
import type { CellOutput } from '../types.js';

// =============================================================================
// Shared Types (matches backend truncation metadata)
// =============================================================================

interface TruncatedOutput extends CellOutput {
  truncated?: boolean;
  truncation_reason?: string | null;
  total_lines?: number;
  total_chars?: number;
}

function formatOutputs(outputs: TruncatedOutput[]): MCPContent {
  return outputs.map(o => {
    if (o.type === 'image') {
      return { type: 'image' as const, data: o.content, mimeType: 'image/png' };
    }
    const prefix = o.type === 'error' ? '[ERROR] ' : '';
    let text = prefix + o.content;

    // Add truncation info if applicable
    if (o.truncated) {
      text += `\n--- [TRUNCATED: ${o.truncation_reason}] ${o.total_lines} total lines, ${o.total_chars} total chars ---`;
    }

    return { type: 'text' as const, text };
  });
}

// =============================================================================
// execute_cell
// =============================================================================

export interface ExecuteCellParams {
  path: string;
  cell_index?: number;
  cell_id?: string;
  session_id?: string;
  max_wait?: number;
  save_outputs?: boolean;
  // Truncation parameters (passed to backend)
  max_lines?: number;
  max_chars?: number;
}

export interface ExecuteCellResult {
  cellId: string;
  outputs: TruncatedOutput[];
  elapsed: number;
  saved: boolean;
}

export const executeCellTool: Tool<ExecuteCellParams, ExecuteCellResult> = {
  definition: {
    name: 'execute_cell',
    description: 'Execute a notebook cell and return its output. Outputs are truncated by default (100 lines, 10000 chars). Outputs are saved incrementally during execution. Requires an active kernel session.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the notebook file' },
        cell_index: { type: 'number', description: 'Cell index to execute (0-based). Use this OR cell_id.' },
        cell_id: { type: 'string', description: 'Stable cell ID. Use this OR cell_index.' },
        session_id: { type: 'string', description: 'Kernel session ID. If not provided, will try to get/create one.' },
        max_wait: { type: 'number', description: 'Max seconds to wait for completion (default: 60)' },
        save_outputs: { type: 'boolean', description: 'Save outputs back to the notebook (default: true)' },
        max_lines: { type: 'number', description: 'Max lines per output (default: 100)' },
        max_chars: { type: 'number', description: 'Max chars per output (default: 10000)' },
      },
      required: ['path'],
    },
    annotations: { destructiveHint: true },
  },

  async execute(params, client) {
    if (params.cell_index === undefined && !params.cell_id) {
      return { success: false, error: 'Must provide either cell_index or cell_id' };
    }

    let sessionId = params.session_id;

    // Get or create kernel session if not provided
    if (!sessionId) {
      const kernelResult = await client.getOrCreateKernelForFile(params.path);
      if (!kernelResult.success) {
        return { success: false, error: kernelResult.error || 'Failed to get kernel for notebook' };
      }
      sessionId = kernelResult.data?.sessionId;
    }

    if (!sessionId) {
      return { success: false, error: 'No kernel session available' };
    }

    const maxWait = params.max_wait ?? 60;
    const saveOutputs = params.save_outputs ?? true;
    const startTime = Date.now();

    // Execute cell (outputs saved to notebook during execution)
    const result = await client.executeCell(params.path, sessionId, {
      cellIndex: params.cell_index,
      cellId: params.cell_id,
      timeout: maxWait * 1000,
      save: saveOutputs,
    });

    const elapsed = (Date.now() - startTime) / 1000;

    if (!result.success) {
      return { success: false, error: `Execution failed after ${elapsed.toFixed(1)}s: ${result.error}` };
    }

    const cellId = result.data?.cellId || params.cell_id || `${params.cell_index}`;

    // Read outputs via backend with truncation applied
    // This ensures truncation is consistent with read_notebook and read_output
    const outputResult = await client.readCellOutputOp(params.path, {
      cellId,
      maxLines: params.max_lines,
      maxChars: params.max_chars,
    });

    if (!outputResult.success) {
      // Fallback: return execution succeeded but couldn't read truncated outputs
      return {
        success: true,
        data: {
          cellId,
          outputs: result.data?.outputs ?? [],
          elapsed,
          saved: saveOutputs,
        },
      };
    }

    return {
      success: true,
      data: {
        cellId,
        outputs: outputResult.data?.outputs ?? [],
        elapsed,
        saved: saveOutputs,
      },
    };
  },

  formatForMCP(result) {
    if (!result.success) {
      return [{ type: 'text', text: `Error: ${result.error}` }];
    }
    const { cellId, outputs, elapsed, saved } = result.data!;
    const savedMsg = saved ? ' (outputs saved)' : '';

    if (outputs.length === 0) {
      return [{ type: 'text', text: `Cell ${cellId} executed in ${elapsed.toFixed(1)}s${savedMsg} (no output)` }];
    }

    return [
      { type: 'text', text: `Cell ${cellId} executed in ${elapsed.toFixed(1)}s${savedMsg}:\n` },
      ...formatOutputs(outputs),
    ];
  },
};

// =============================================================================
// Export all execution tools
// =============================================================================

export const executionTools = [
  executeCellTool,
];
