/**
 * Code Execution Tools
 *
 * Tools for executing code in kernel sessions with streaming output.
 */
import type { Tool } from '../types.js';
import type { NebulaClient } from '../../notebook/client.js';
export declare const executionTools: Tool[];
export declare function handleExecutionTool(name: string, args: Record<string, unknown>, client: NebulaClient): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    } | {
        type: 'image';
        data: string;
        mimeType: string;
    }>;
    isError?: boolean;
}>;
//# sourceMappingURL=execution.d.ts.map