/**
 * Web search tools - DuckDuckGo (free, no API key)
 */
import type { ToolResult, ExecuteOptions } from '../../types.js';
export interface WebSearchParams {
    /** Search query */
    query: string;
    /** Max results to return (default: 10) */
    limit?: number;
}
export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}
export interface WebSearchResult {
    results: SearchResult[];
    query: string;
}
/**
 * Search using DuckDuckGo HTML (no API key required)
 */
export declare function webSearch(params: WebSearchParams, options?: ExecuteOptions): Promise<ToolResult<WebSearchResult>>;
/**
 * Tool definition for agents
 */
export declare const webSearchToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            query: {
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
//# sourceMappingURL=search.d.ts.map