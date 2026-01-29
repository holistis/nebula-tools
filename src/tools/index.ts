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

// Tools that operate on notebooks and should track user changes
const NOTEBOOK_TOOLS = new Set([
  'read_notebook', 'read_cell', 'read_output',
  'insert_cell', 'update_cell', 'delete_cell', 'delete_cells',
  'move_cell', 'duplicate_cell', 'insert_cells',
  'create_notebook', 'search_cells', 'update_metadata',
  'clear_outputs', 'execute_cell',
  'start_agent_session', 'end_agent_session',
]);

/**
 * Execute a tool and format result for MCP display
 *
 * Automatically includes user changes since the last tool call for notebook operations.
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

  // Extract notebook path for user change tracking
  const notebookPath = (params.path as string) || undefined;
  const isNotebookTool = NOTEBOOK_TOOLS.has(name) && notebookPath;

  // Query user changes BEFORE executing the tool (to capture what happened since last call)
  let userChanges: Array<{ type: string; cellId?: string; cellIndex?: number; timestamp: number; description: string }> = [];
  if (isNotebookTool) {
    try {
      const changesResult = await client.getUserChangesOp(notebookPath);
      if (changesResult.success && changesResult.data?.changes.length) {
        userChanges = changesResult.data.changes;
      }
    } catch (e) {
      // Silently ignore errors in user change tracking
      console.error('[executeToolForMCP] Error getting user changes:', e);
    }
  }

  try {
    // Clear any stale backend info before executing the tool
    client.consumeLastBackend();
    const result = await tool.execute(params, client);
    const backend = client.consumeLastBackend();

    // Record the tool call timestamp for future change tracking
    if (isNotebookTool) {
      client.recordToolCallTimestamp(notebookPath);
    }

    // Build content array
    let content: MCPContent;

    // Use custom formatter if available, otherwise default JSON
    if (tool.formatForMCP) {
      content = await tool.formatForMCP(result);
    } else if (!result.success) {
      content = [{ type: 'text', text: `Error: ${result.error}` }];
    } else {
      content = [{ type: 'text', text: JSON.stringify(result.data, null, 2) }];
    }

    // Add backend info
    if (backend) {
      content.push({ type: 'text', text: `Backend: ${backend}` });
    }

    // Add user changes if any (silent if none)
    if (userChanges.length > 0) {
      const changesSummary = userChanges.map(c =>
        `  • ${c.description} (${new Date(c.timestamp).toLocaleTimeString()})`
      ).join('\n');
      content.push({
        type: 'text',
        text: `\n📝 User changes since last tool call:\n${changesSummary}`,
      });
    }

    return {
      content,
      isError: !result.success,
    };
  } catch (error) {
    client.consumeLastBackend();
    // Still record timestamp even on error
    if (isNotebookTool) {
      client.recordToolCallTimestamp(notebookPath);
    }
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
