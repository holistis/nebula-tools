/**
 * Nebula Tools - Shared tools for Nebula Notebook and Nexus Agentic IDE
 *
 * ## Structure
 *
 * - `notebook/` - Notebook-specific tools (unique to nebula-tools)
 * - `gemini-cli/` - Original Gemini CLI tools (from Google, Apache 2.0 license)
 * - `_archived/` - Simplified standalone implementations (for reference/lightweight use)
 *
 * ## Usage
 *
 * ### Notebook Tools (standalone, no dependencies)
 * ```typescript
 * import { createNebulaClient, searchNotebookCells } from 'nebula-tools';
 *
 * const client = createNebulaClient({ baseUrl: 'http://localhost:8000' });
 * const results = await searchNotebookCells({ notebookPath: 'analysis.ipynb', query: 'pandas' }, client);
 * ```
 *
 * ### Gemini CLI Tools (full-featured, from Google)
 * ```typescript
 * // Import the full gemini-cli module
 * import * as geminiCli from 'nebula-tools/gemini-cli';
 *
 * // Or import specific tools
 * import { ReadFileTool } from 'nebula-tools/gemini-cli/tools/read-file';
 * ```
 *
 * Available tools:
 * - read-file, write-file, edit, smart-edit
 * - glob, grep, ripGrep, ls
 * - shell
 * - web-fetch, web-search, free-web-fetch, free-web-search
 * - write-todos, memoryTool
 *
 * Note: These require Gemini CLI Config/MessageBus infrastructure.
 *
 * ### Archived Simplified Tools (standalone, no dependencies)
 * ```typescript
 * import { grep, findFiles, shell } from 'nebula-tools/_archived';
 * ```
 */
export * from './types.js';
export { classifyError, getErrorMessage, formatErrorMessage, shouldRetry, calculateRetryDelay, ErrorCategory, type ClassifiedError, type RecoverabilityStatus, } from './errors.js';
export { CircuitBreaker, createCircuitBreaker, CircuitState, type CircuitBreakerOptions, type CircuitBreakerEvent, type CircuitBreakerListener, type CircuitBreakerResult, } from './circuit-breaker.js';
export { NebulaClient, createNebulaClient, type NebulaClientConfig, type KernelSession, type ExecutionResult, type WriteCellResult, } from './notebook/client.js';
export { type Tool, type ToolDefinition, type ToolResult, type MCPContent, allTools, toolsByName, toolCategories, notebookTools, kernelTools, executionTools, getToolDefinitions, executeToolByName, executeToolForMCP, getTool, hasTool, getToolNamesByCategory, readNotebookTool, readCellTool, readOutputTool, insertCellTool, updateCellTool, deleteCellTool, createNotebookTool, moveCellTool, duplicateCellTool, searchCellsTool, updateMetadataTool, listKernelsTool, kernelStartTool, kernelStopTool, kernelRestartTool, kernelInterruptTool, executeCellTool, } from './tools/index.js';
export { readNotebookCells, writeNotebookCell, executeCell, searchNotebookCells, readCellsToolDefinition, writeCellToolDefinition, executeCellToolDefinition, searchCellsToolDefinition, type ReadCellsParams, type ReadCellsResult, type WriteCellParams, type ExecuteCellParams, type ExecuteCellResult, type SearchCellsParams, type SearchCellsResult, } from './notebook/tools.js';
/**
 * Reference to Gemini CLI tool names available in gemini-cli/tools/
 * These require the full Gemini CLI infrastructure to use.
 */
export declare const geminiCliToolNames: readonly ["read_file", "write_file", "edit", "replace", "glob", "grep", "search_file_content", "list_directory", "run_shell_command", "web_fetch", "google_web_search", "web_fetch_free", "web_search_free", "write_todos", "memory"];
//# sourceMappingURL=index.d.ts.map