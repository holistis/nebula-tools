/**
 * Kernel Management Tools
 *
 * Tools for managing Jupyter kernel sessions.
 */
import type { Tool } from '../types.js';
import type { NebulaClient } from '../../notebook/client.js';
export declare const kernelTools: Tool[];
export declare function handleKernelTool(name: string, args: Record<string, unknown>, client: NebulaClient): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}>;
//# sourceMappingURL=kernel.d.ts.map