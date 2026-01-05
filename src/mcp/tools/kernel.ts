/**
 * Kernel Management Tools
 *
 * Tools for managing Jupyter kernel sessions.
 */

import type { Tool } from '../types.js';
import type { NebulaClient } from '../../notebook/client.js';
import { successResponse, errorResponse } from '../utils.js';

export const kernelTools: Tool[] = [
  {
    name: 'list_kernels',
    description: 'List available kernel specifications (e.g., python3, ir, julia)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_sessions',
    description: 'List all active kernel sessions with their status and memory usage',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kernel_start',
    description: 'Start a new kernel session for a notebook',
    inputSchema: {
      type: 'object',
      properties: {
        kernel_name: {
          type: 'string',
          description: 'Kernel name (e.g., python3). Defaults to python3.',
          default: 'python3',
        },
        file_path: {
          type: 'string',
          description: 'Optional notebook file path to associate with the kernel',
        },
      },
      required: [],
    },
  },
  {
    name: 'kernel_stop',
    description: 'Stop and shutdown a kernel session',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID of the kernel to stop',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'kernel_restart',
    description: 'Restart a kernel session (clears all variables)',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID of the kernel to restart',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'kernel_interrupt',
    description: 'Interrupt a running execution in a kernel',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID of the kernel to interrupt',
        },
      },
      required: ['session_id'],
    },
  },
];

export async function handleKernelTool(
  name: string,
  args: Record<string, unknown>,
  client: NebulaClient
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  switch (name) {
    case 'list_kernels': {
      const result = await client.listKernels();
      if (!result.success) {
        return errorResponse(result.error || 'Failed to list kernels');
      }
      const kernels = result.data || [];
      return successResponse(`Available kernels:\n${kernels.map((k) => `  - ${k}`).join('\n')}`);
    }

    case 'list_sessions': {
      const result = await client.listSessions();
      if (!result.success) {
        return errorResponse(result.error || 'Failed to list sessions');
      }
      const sessions = result.data || [];
      if (sessions.length === 0) {
        return successResponse('No active kernel sessions');
      }
      const lines = sessions.map(
        (s: { id: string; kernel_name: string; status: string }) =>
          `  - ${s.id}: ${s.kernel_name} (${s.status})`
      );
      return successResponse(`Active sessions:\n${lines.join('\n')}`);
    }

    case 'kernel_start': {
      const kernelName = (args.kernel_name as string) || 'python3';
      const filePath = args.file_path as string | undefined;
      const result = await client.startKernel(kernelName, filePath);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to start kernel');
      }
      return successResponse(
        `Kernel started: ${result.data?.sessionId} (${result.data?.kernelName})`
      );
    }

    case 'kernel_stop': {
      const sessionId = args.session_id as string;
      const result = await client.shutdownKernel(sessionId);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to stop kernel');
      }
      return successResponse(`Kernel ${sessionId} stopped`);
    }

    case 'kernel_restart': {
      const sessionId = args.session_id as string;
      const result = await client.restartKernel(sessionId);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to restart kernel');
      }
      return successResponse(`Kernel ${sessionId} restarted`);
    }

    case 'kernel_interrupt': {
      const sessionId = args.session_id as string;
      const result = await client.interruptKernel(sessionId);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to interrupt kernel');
      }
      return successResponse(`Kernel ${sessionId} interrupted`);
    }

    default:
      return errorResponse(`Unknown kernel tool: ${name}`);
  }
}
