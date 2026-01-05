/**
 * Code Execution Tools
 *
 * Tools for executing code in kernel sessions with streaming output.
 */
import { successResponse, errorResponse, formatOutputs } from '../utils.js';
export const executionTools = [
    {
        name: 'execute_cell',
        description: 'Execute a notebook cell by index and return its output. Requires an active kernel session.',
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
export async function handleExecutionTool(name, args, client) {
    switch (name) {
        case 'execute_cell': {
            const path = args.path;
            const cellIndex = args.cell_index;
            let sessionId = args.session_id;
            const timeout = args.timeout ?? 60;
            // Read the notebook to get the cell content
            const notebookResult = await client.readNotebook(path);
            if (!notebookResult.success) {
                return errorResponse(notebookResult.error || 'Failed to read notebook');
            }
            const notebook = notebookResult.data;
            if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
                return errorResponse(`Cell index ${cellIndex} out of range (0-${notebook.cells.length - 1})`);
            }
            const cell = notebook.cells[cellIndex];
            if (cell.type !== 'code') {
                return errorResponse(`Cell ${cellIndex} is a ${cell.type} cell, not a code cell`);
            }
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
            // Execute the code with streaming
            const startTime = Date.now();
            const result = await client.executeCodeStreaming(sessionId, cell.content, timeout * 1000);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            if (!result.success) {
                return errorResponse(`Execution failed after ${elapsed}s: ${result.error}`);
            }
            const outputs = result.data?.outputs ?? [];
            if (outputs.length === 0) {
                return successResponse(`Cell ${cellIndex} executed successfully in ${elapsed}s (no output)`);
            }
            // Format outputs
            const content = [
                { type: 'text', text: `Cell ${cellIndex} executed in ${elapsed}s:\n` },
            ];
            content.push(...formatOutputs(outputs));
            return { content };
        }
        case 'execute_code': {
            const sessionId = args.session_id;
            const code = args.code;
            const timeout = args.timeout ?? 30;
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
            const content = [
                { type: 'text', text: `Executed in ${elapsed}s:\n` },
            ];
            content.push(...formatOutputs(outputs));
            return { content };
        }
        default:
            return errorResponse(`Unknown execution tool: ${name}`);
    }
}
//# sourceMappingURL=execution.js.map