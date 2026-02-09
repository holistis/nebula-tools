/**
 * Tools Index
 *
 * Single source of truth for all tool definitions.
 * MCP server and other clients use these tools directly.
 */
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
export const allTools = [
    ...notebookTools,
    ...kernelTools,
    ...executionTools,
    ...fileTools,
];
/**
 * Map of tool name to tool object for quick lookup
 */
export const toolsByName = new Map(allTools.map(tool => [tool.definition.name, tool]));
/**
 * Get all tool definitions (MCP-compatible format)
 */
export function getToolDefinitions() {
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
export async function executeToolByName(name, params, client) {
    const tool = toolsByName.get(name);
    if (!tool) {
        return { success: false, error: `Unknown tool: ${name}` };
    }
    try {
        return await tool.execute(params, client);
    }
    catch (error) {
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
    'clear_notebook', 'clear_outputs', 'execute_cell',
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
export async function executeToolForMCP(name, params, client) {
    const tool = toolsByName.get(name);
    if (!tool) {
        return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
        };
    }
    // Extract notebook path for user change tracking
    const notebookPath = params.path || undefined;
    const isNotebookTool = NOTEBOOK_TOOLS.has(name) && notebookPath;
    // Query updates BEFORE executing the tool (to capture what happened since last call)
    let updatesSince = [];
    if (isNotebookTool) {
        try {
            const updatesResult = await client.getUpdatesSinceOp(notebookPath);
            if (updatesResult.success && updatesResult.data?.updates.length) {
                updatesSince = updatesResult.data.updates;
            }
        }
        catch (e) {
            // Silently ignore errors in update tracking
            console.error('[executeToolForMCP] Error getting updates:', e);
        }
    }
    try {
        // Clear any stale backend info before executing the tool
        client.consumeLastBackend();
        client.consumeAutoStartWarning();
        const result = await tool.execute(params, client);
        const backend = client.consumeLastBackend();
        const autoStartWarning = client.consumeAutoStartWarning();
        // Record the tool call timestamp for future change tracking
        if (isNotebookTool) {
            client.recordToolCallTimestamp(notebookPath);
        }
        // Build content array
        let content;
        // Use custom formatter if available, otherwise default JSON
        if (tool.formatForMCP) {
            content = await tool.formatForMCP(result);
        }
        else if (!result.success) {
            content = [{ type: 'text', text: `Error: ${result.error}` }];
        }
        else {
            content = [{ type: 'text', text: JSON.stringify(result.data, null, 2) }];
        }
        // Add backend info
        if (autoStartWarning) {
            content.push({ type: 'text', text: `Warning: ${autoStartWarning}` });
        }
        if (backend) {
            content.push({ type: 'text', text: `Backend: ${backend}` });
        }
        // Add updates if any (silent if none)
        if (updatesSince.length > 0) {
            const changesSummary = updatesSince.map(c => `  • ${c.description} (${new Date(c.timestamp).toLocaleTimeString()})`).join('\n');
            content.push({
                type: 'text',
                text: `\n📝 Updates since last tool call:\n${changesSummary}`,
            });
        }
        return {
            content,
            isError: !result.success,
        };
    }
    catch (error) {
        client.consumeLastBackend();
        client.consumeAutoStartWarning();
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
export function getTool(name) {
    return toolsByName.get(name);
}
/**
 * Check if a tool exists
 */
export function hasTool(name) {
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
};
/**
 * Get tool names by category
 */
export function getToolNamesByCategory() {
    return {
        notebook: notebookTools.map(t => t.definition.name),
        kernel: kernelTools.map(t => t.definition.name),
        execution: executionTools.map(t => t.definition.name),
        files: fileTools.map(t => t.definition.name),
    };
}
//# sourceMappingURL=index.js.map