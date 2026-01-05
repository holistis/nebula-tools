/**
 * MCP Utility Functions
 *
 * Output processing, ANSI stripping, and helper functions.
 */
import type { CellOutput } from '../types.js';
/**
 * Strip ANSI escape codes from text
 */
export declare function stripAnsi(text: string): string;
/**
 * Process Jupyter output into MCP-compatible format
 */
export declare function processOutput(output: CellOutput): {
    type: 'text';
    text: string;
} | {
    type: 'image';
    data: string;
    mimeType: string;
};
/**
 * Format multiple outputs for MCP response
 */
export declare function formatOutputs(outputs: CellOutput[]): Array<{
    type: 'text';
    text: string;
} | {
    type: 'image';
    data: string;
    mimeType: string;
}>;
/**
 * Truncate text with head/tail preservation
 */
export declare function truncateWithHeadTail(text: string, maxLines?: number): string;
/**
 * Create a success response for MCP
 */
export declare function successResponse(text: string): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
};
/**
 * Create an error response for MCP
 */
export declare function errorResponse(message: string): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError: true;
};
//# sourceMappingURL=utils.d.ts.map