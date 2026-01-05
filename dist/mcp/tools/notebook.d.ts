/**
 * Notebook Operations Tools
 *
 * Tools for reading, writing, and searching notebook cells.
 */
import type { Tool } from '../types.js';
import type { NebulaClient } from '../../notebook/client.js';
export declare const notebookTools: Tool[];
export declare function handleNotebookTool(name: string, args: Record<string, unknown>, client: NebulaClient): Promise<{
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
//# sourceMappingURL=notebook.d.ts.map