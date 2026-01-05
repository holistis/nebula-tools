/**
 * Code Execution Tools
 *
 * Tools for executing code in kernel sessions with streaming output.
 */

import type { Tool } from '../types.js';
import type { NebulaClient } from '../../notebook/client.js';
import { successResponse, errorResponse, formatOutputs, truncateWithHeadTail } from '../utils.js';

export const executionTools: Tool[] = [
  {
    name: 'execute_cell',
    description: 'Execute a notebook cell by index and return its output. By default, saves the outputs back to the notebook. Requires an active kernel session.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the notebook file',
        },
        cell_index: {
          type: 'number',
          description: 'Cell index to execute (0-based)',
        },
        session_id: {
          type: 'string',
          description: 'Kernel session ID. If not provided, will try to get/create one for the notebook.',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in seconds (default: 60)',
          default: 60,
        },
        save_outputs: {
          type: 'boolean',
          description: 'Save execution outputs back to the notebook (default: true)',
          default: true,
        },
      },
      required: ['path', 'cell_index'],
    },
  },
  {
    name: 'execute_code',
    description: 'Execute arbitrary code in a kernel session (not saved to notebook). Useful for quick tests or inspecting variables.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Kernel session ID',
        },
        code: {
          type: 'string',
          description: 'Code to execute',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in seconds (default: 30)',
          default: 30,
        },
      },
      required: ['session_id', 'code'],
    },
  },
];

export async function handleExecutionTool(
  name: string,
  args: Record<string, unknown>,
  client: NebulaClient
): Promise<{ content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean }> {
  switch (name) {
    case 'execute_cell': {
      const path = args.path as string;
      const cellIndex = args.cell_index as number;
      let sessionId = args.session_id as string | undefined;
      const timeout = (args.timeout as number) ?? 60;
      const saveOutputs = (args.save_outputs as boolean) ?? true;

      // Get or create kernel session if not provided
      if (!sessionId) {
        const kernelResult = await client.getOrCreateKernelForFile(path);
        if (!kernelResult.success) {
          return errorResponse(kernelResult.error || 'Failed to get kernel for notebook');
        }
        sessionId = kernelResult.data?.sessionId;
      }

      if (!sessionId) {
        return errorResponse('No kernel session available');
      }

      // Execute the cell (reads notebook, executes, saves outputs in one operation)
      const startTime = Date.now();
      const result = await client.executeCell(path, cellIndex, sessionId, {
        timeout: timeout * 1000,
        save: saveOutputs,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!result.success) {
        return errorResponse(`Execution failed after ${elapsed}s: ${result.error}`);
      }

      const outputs = result.data?.outputs ?? [];
      const savedMsg = saveOutputs ? ' (outputs saved)' : '';

      if (outputs.length === 0) {
        return successResponse(`Cell ${cellIndex} executed in ${elapsed}s${savedMsg} (no output)`);
      }

      // Format outputs
      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
        { type: 'text', text: `Cell ${cellIndex} executed in ${elapsed}s${savedMsg}:\n` },
      ];
      content.push(...formatOutputs(outputs));

      return { content };
    }

    case 'execute_code': {
      const sessionId = args.session_id as string;
      const code = args.code as string;
      const timeout = (args.timeout as number) ?? 30;

      const startTime = Date.now();
      const result = await client.executeCodeStreaming(sessionId, code, timeout * 1000);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!result.success) {
        return errorResponse(`Execution failed after ${elapsed}s: ${result.error}`);
      }

      const outputs = result.data?.outputs ?? [];
      if (outputs.length === 0) {
        return successResponse(`Code executed in ${elapsed}s (no output)`);
      }

      // Format outputs
      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
        { type: 'text', text: `Executed in ${elapsed}s:\n` },
      ];
      content.push(...formatOutputs(outputs));

      return { content };
    }

    default:
      return errorResponse(`Unknown execution tool: ${name}`);
  }
}
