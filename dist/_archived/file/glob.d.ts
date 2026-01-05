/**
 * Glob tool - find files by pattern
 */
import type { GlobEntry, ToolResult, ExecuteOptions } from '../../types.js';
export interface GlobParams {
    /** Glob pattern to match files */
    pattern: string;
    /** Directory to search in (defaults to cwd) */
    path?: string;
    /** Case sensitive matching (default: false) */
    caseSensitive?: boolean;
    /** Include dotfiles (default: true) */
    dot?: boolean;
    /** Max results to return */
    limit?: number;
    /** Sort by modification time, newest first (default: true) */
    sortByMtime?: boolean;
}
export interface GlobResult {
    files: GlobEntry[];
    totalCount: number;
    truncated: boolean;
}
/**
 * Find files matching glob pattern
 */
export declare function findFiles(params: GlobParams, options?: ExecuteOptions): Promise<ToolResult<GlobResult>>;
/**
 * Tool definition for agents
 */
export declare const globToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            pattern: {
                type: string;
                description: string;
            };
            path: {
                type: string;
                description: string;
            };
            caseSensitive: {
                type: string;
                description: string;
            };
            dot: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
//# sourceMappingURL=glob.d.ts.map