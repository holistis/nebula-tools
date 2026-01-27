/**
 * Tools Index
 *
 * Single source of truth for all tool definitions.
 * MCP server and other clients use these tools directly.
 */

import type { NebulaClient } from '../notebook/client.js';
import type { Tool, ToolDefinition, ToolResult, MCPContent } from './types.js';

// Re-export types
export type { Tool, ToolDefinition, ToolResult, MCPContent } from './types.js';

// Import all tool categories
import { notebookTools } from './notebook.js';
import { kernelTools } from './kernel.js';
import { executionTools } from './execution.js';
import { fileTools } from './files.js';

// Re-export tool categories for direct access
export { notebookTools } from './notebook.js';
export { kernelTools } from './kernel.js';
export { executionTools } from './execution.js';
export { fileTools } from './files.js';

// Re-export individual tools for TypeScript consumers who need type safety
export * from './notebook.js';
export * from './kernel.js';
export * from './execution.js';
export * from './files.js';

/**
 * All tools combined in a single array
 */
export const allTools: Tool<any, any>[] = [
  ...notebookTools,
  ...kernelTools,
  ...executionTools,
  ...fileTools,
];

/**
 * Map of tool name to tool object for quick lookup
 */
export const toolsByName: Map<string, Tool<any, any>> = new Map(
  allTools.map(tool => [tool.definition.name, tool])
);

/**
 * Get all tool definitions (MCP-compatible format)
 */
export function getToolDefinitions(): ToolDefinition[] {
  return allTools.map(tool => tool.definition);
}

/**
 * Execute a tool by name with given parameters
 *
 * @param name - Tool name
 * @param params - Tool parameters
 * @param client - NebulaClient instance
 * @returns Tool result
 */
export async function executeToolByName(
  name: string,
  params: Record<string, unknown>,
  client: NebulaClient
): Promise<ToolResult<unknown>> {
  const tool = toolsByName.get(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }

  try {
    return await tool.execute(params, client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Tool execution failed: ${message}` };
  }
}

/**
 * Execute a tool and format result for MCP display
 *
 * @param name - Tool name
 * @param params - Tool parameters
 * @param client - NebulaClient instance
 * @returns MCP-formatted content
 */
export async function executeToolForMCP(
  name: string,
  params: Record<string, unknown>,
  client: NebulaClient
): Promise<{ content: MCPContent; isError?: boolean }> {
  const tool = toolsByName.get(name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    // Clear any stale backend info before executing the tool
    client.consumeLastBackend();
    const result = await tool.execute(params, client);
    const backend = client.consumeLastBackend();

    // Use custom formatter if available, otherwise default JSON
    if (tool.formatForMCP) {
      const content = await tool.formatForMCP(result);
      if (backend) {
        content.push({ type: 'text', text: `Backend: ${backend}` });
      }
      return {
        content,
        isError: !result.success,
      };
    }

    // Default formatting
    if (!result.success) {
      const content: MCPContent = [{ type: 'text', text: `Error: ${result.error}` }];
      if (backend) {
        content.push({ type: 'text', text: `Backend: ${backend}` });
      }
      return { content, isError: true };
    }

    const content: MCPContent = [{ type: 'text', text: JSON.stringify(result.data, null, 2) }];
    if (backend) {
      content.push({ type: 'text', text: `Backend: ${backend}` });
    }
    return { content };
  } catch (error) {
    client.consumeLastBackend();
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Tool execution failed: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Get tool by name
 */
export function getTool(name: string): Tool<any, any> | undefined {
  return toolsByName.get(name);
}

/**
 * Check if a tool exists
 */
export function hasTool(name: string): boolean {
  return toolsByName.has(name);
}

/**
 * Tool categories for organized access
 */
export const toolCategories = {
  notebook: notebookTools,
  kernel: kernelTools,
  execution: executionTools,
  files: fileTools,
} as const;

/**
 * Get tool names by category
 */
export function getToolNamesByCategory(): Record<string, string[]> {
  return {
    notebook: notebookTools.map(t => t.definition.name),
    kernel: kernelTools.map(t => t.definition.name),
    execution: executionTools.map(t => t.definition.name),
    files: fileTools.map(t => t.definition.name),
  };
}
