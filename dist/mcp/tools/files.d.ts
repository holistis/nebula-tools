/**
 * File Operation Tools
 *
 * Tools for file system operations.
 */
import type { Tool } from '../types.js';
import type { NebulaClient } from '../../notebook/client.js';
export declare const fileTools: Tool[];
export declare function handleFileTool(name: string, args: Record<string, unknown>, client: NebulaClient): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}>;
//# sourceMappingURL=files.d.ts.map