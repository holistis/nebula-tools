/**
 * MCP Utility Functions
 *
 * Output processing, ANSI stripping, and helper functions.
 */

import type { CellOutput } from '../types.js';

// ANSI escape code regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

/**
 * Process Jupyter output into MCP-compatible format
 */
export function processOutput(output: CellOutput): { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string } {
  switch (output.type) {
    case 'stdout':
    case 'stderr':
      return { type: 'text', text: stripAnsi(output.content) };

    case 'error':
      return { type: 'text', text: `[ERROR]\n${stripAnsi(output.content)}` };

    case 'image':
      return { type: 'image', data: output.content, mimeType: 'image/png' };

    case 'html':
      return { type: 'text', text: '[HTML Output - view in notebook]' };

    default:
      return { type: 'text', text: output.content };
  }
}

/**
 * Format multiple outputs for MCP response
 */
export function formatOutputs(outputs: CellOutput[]): Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
  return outputs.map(processOutput);
}

/**
 * Truncate text with head/tail preservation
 */
export function truncateWithHeadTail(text: string, maxLines: number = 100): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;

  const headLines = Math.floor(maxLines / 2);
  const tailLines = maxLines - headLines;
  const omitted = lines.length - maxLines;

  return [
    ...lines.slice(0, headLines),
    `\n... [${omitted} lines omitted] ...\n`,
    ...lines.slice(-tailLines),
  ].join('\n');
}

/**
 * Create a success response for MCP
 */
export function successResponse(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text }] };
}

/**
 * Create an error response for MCP
 */
export function errorResponse(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true };
}
