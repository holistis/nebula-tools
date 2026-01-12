/**
 * Execution Tools
 *
 * Tools for executing code in kernel sessions with streaming output.
 */

import type { Tool, ToolResult, MCPContent } from './types.js';
import type { NebulaClient } from '../notebook/client.js';
import type { CellOutput } from '../types.js';

// =============================================================================
// Truncation Defaults
// =============================================================================

const DEFAULT_MAX_LINES = 100;
const DEFAULT_MAX_CHARS = 10000;

// =============================================================================
// Shared Utilities
// =============================================================================

interface TruncationMetadata {
  truncated: boolean;
  truncation_reason: 'lines' | 'chars' | null;
  total_lines: number;
  total_chars: number;
  returned_range: {
    start_line: number;
    end_line: number;
    char_count: number;
  };
}

function truncateOutput(
  content: string,
  maxLines: number,
  maxChars: number
): { content: string; metadata: TruncationMetadata } {
  const lines = content.split('\n');
  const totalLines = lines.length;
  const totalChars = content.length;

  let truncated = false;
  let truncationReason: 'lines' | 'chars' | null = null;
  let resultLines = lines;
  let endLine = totalLines;

  // Truncate by lines first
  if (totalLines > maxLines) {
    resultLines = lines.slice(0, maxLines);
    endLine = maxLines;
    truncated = true;
    truncationReason = 'lines';
  }

  let result = resultLines.join('\n');

  // Then check chars (but always include at least one line)
  if (result.length > maxChars && resultLines.length > 1) {
    // Find how many complete lines fit within maxChars
    let charCount = 0;
    let lineCount = 0;
    for (const line of resultLines) {
      if (charCount + line.length + 1 > maxChars && lineCount > 0) break;
      charCount += line.length + 1;
      lineCount++;
    }
    resultLines = resultLines.slice(0, Math.max(1, lineCount));
    result = resultLines.join('\n');
    endLine = resultLines.length;
    truncated = true;
    truncationReason = 'chars';
  }

  return {
    content: result,
    metadata: {
      truncated,
      truncation_reason: truncationReason,
      total_lines: totalLines,
      total_chars: totalChars,
      returned_range: {
        start_line: 0,
        end_line: endLine,
        char_count: result.length,
      },
    },
  };
}

interface TruncatedOutput extends CellOutput {
  truncated?: boolean;
  truncation_reason?: 'lines' | 'chars' | null;
  total_lines?: number;
  total_chars?: number;
}

function truncateOutputs(
  outputs: CellOutput[],
  maxLines: number,
  maxChars: number
): TruncatedOutput[] {
  return outputs.map(output => {
    // Don't truncate images
    if (output.type === 'image') {
      return { ...output };
    }

    const { content, metadata } = truncateOutput(output.content, maxLines, maxChars);
    return {
      ...output,
      content,
      truncated: metadata.truncated,
      truncation_reason: metadata.truncation_reason,
      total_lines: metadata.total_lines,
      total_chars: metadata.total_chars,
    };
  });
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
  // Truncation parameters
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
    const maxLines = params.max_lines ?? DEFAULT_MAX_LINES;
    const maxChars = params.max_chars ?? DEFAULT_MAX_CHARS;
    const startTime = Date.now();

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

    // Apply truncation to outputs
    const outputs = truncateOutputs(result.data?.outputs ?? [], maxLines, maxChars);

    return {
      success: true,
      data: {
        cellId: result.data?.cellId || params.cell_id || `${params.cell_index}`,
        outputs,
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
