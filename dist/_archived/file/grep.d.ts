/**
 * Grep tool - search file contents using regex
 * Supports: git grep, ripgrep (rg), system grep, JS fallback
 */
import type { GrepMatch, ToolResult, ExecuteOptions } from '../../types.js';
export interface GrepParams {
    /** Regex pattern to search for */
    pattern: string;
    /** Directory to search in (defaults to cwd) */
    path?: string;
    /** File pattern filter (e.g., "*.ts", "*.{js,jsx}") */
    include?: string;
    /** Case insensitive search */
    ignoreCase?: boolean;
    /** Max results to return */
    limit?: number;
}
export interface GrepResult {
    matches: GrepMatch[];
    totalCount: number;
    truncated: boolean;
}
/**
 * Search file contents using regex pattern
 */
export declare function grep(params: GrepParams, options?: ExecuteOptions): Promise<ToolResult<GrepResult>>;
/**
 * Tool definition for agents
 */
export declare const grepToolDefinition: {
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
            include: {
                type: string;
                description: string;
            };
            ignoreCase: {
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
//# sourceMappingURL=grep.d.ts.map