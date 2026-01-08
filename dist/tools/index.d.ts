/**
 * Tools Index
 *
 * Single source of truth for all tool definitions.
 * MCP server and other clients use these tools directly.
 */
import type { NebulaClient } from '../notebook/client.js';
import type { Tool, ToolDefinition, ToolResult, MCPContent } from './types.js';
export type { Tool, ToolDefinition, ToolResult, MCPContent } from './types.js';
export { notebookTools } from './notebook.js';
export { kernelTools } from './kernel.js';
export { executionTools } from './execution.js';
export * from './notebook.js';
export * from './kernel.js';
export * from './execution.js';
/**
 * All tools combined in a single array
 */
export declare const allTools: Tool<any, any>[];
/**
 * Map of tool name to tool object for quick lookup
 */
export declare const toolsByName: Map<string, Tool<any, any>>;
/**
 * Get all tool definitions (MCP-compatible format)
 */
export declare function getToolDefinitions(): ToolDefinition[];
/**
 * Execute a tool by name with given parameters
 *
 * @param name - Tool name
 * @param params - Tool parameters
 * @param client - NebulaClient instance
 * @returns Tool result
 */
export declare function executeToolByName(name: string, params: Record<string, unknown>, client: NebulaClient): Promise<ToolResult<unknown>>;
/**
 * Execute a tool and format result for MCP display
 *
 * @param name - Tool name
 * @param params - Tool parameters
 * @param client - NebulaClient instance
 * @returns MCP-formatted content
 */
export declare function executeToolForMCP(name: string, params: Record<string, unknown>, client: NebulaClient): Promise<{
    content: MCPContent;
    isError?: boolean;
}>;
/**
 * Get tool by name
 */
export declare function getTool(name: string): Tool<any, any> | undefined;
/**
 * Check if a tool exists
 */
export declare function hasTool(name: string): boolean;
/**
 * Tool categories for organized access
 */
export declare const toolCategories: {
    readonly notebook: (Tool<import("./notebook.js").ReadNotebookParams, import("./notebook.js").ReadNotebookResult> | Tool<import("./notebook.js").ReadCellParams, import("./notebook.js").ReadCellResult> | Tool<import("./notebook.js").ReadOutputParams, import("./notebook.js").ReadOutputResult> | Tool<import("./notebook.js").InsertCellParams, import("./notebook.js").InsertCellResult> | Tool<import("./notebook.js").UpdateCellParams, import("./notebook.js").UpdateCellResult> | Tool<import("./notebook.js").DeleteCellParams, void> | Tool<import("./notebook.js").ClearNotebookParams, import("./notebook.js").ClearNotebookResult> | Tool<import("./notebook.js").MoveCellParams, void> | Tool<import("./notebook.js").DuplicateCellParams, import("./notebook.js").DuplicateCellResult> | Tool<import("./notebook.js").SearchCellsParams, import("./notebook.js").SearchCellsResult> | Tool<import("./notebook.js").UpdateMetadataParams, import("./notebook.js").UpdateMetadataResult>)[];
    readonly kernel: (Tool<import("./kernel.js").ListKernelsParams, import("./kernel.js").ListKernelsResult> | Tool<import("./kernel.js").KernelStartParams, import("./kernel.js").KernelStartResult> | Tool<import("./kernel.js").KernelStopParams, void>)[];
    readonly execution: Tool<import("./execution.js").ExecuteCellParams, import("./execution.js").ExecuteCellResult>[];
};
/**
 * Get tool names by category
 */
export declare function getToolNamesByCategory(): Record<string, string[]>;
//# sourceMappingURL=index.d.ts.map