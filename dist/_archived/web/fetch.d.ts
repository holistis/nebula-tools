/**
 * Web fetch tool - retrieve and process web content
 */
import type { ToolResult, ExecuteOptions } from '../../types.js';
export interface WebFetchParams {
    /** URL to fetch */
    url: string;
    /** Extract only text content (strip HTML) */
    textOnly?: boolean;
    /** Max content length to return */
    maxLength?: number;
}
export interface WebFetchResult {
    url: string;
    content: string;
    contentType: string;
    truncated: boolean;
}
/**
 * Fetch web content
 */
export declare function webFetch(params: WebFetchParams, options?: ExecuteOptions): Promise<ToolResult<WebFetchResult>>;
/**
 * Tool definition for agents
 */
export declare const webFetchToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            url: {
                type: string;
                description: string;
            };
            textOnly: {
                type: string;
                description: string;
            };
            maxLength: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
//# sourceMappingURL=fetch.d.ts.map