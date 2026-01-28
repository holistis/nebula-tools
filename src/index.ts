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

// =============================================================================
// Core Types
// =============================================================================
export * from './types.js';

// =============================================================================
// Error Handling
// =============================================================================
export {
  classifyError,
  getErrorMessage,
  formatErrorMessage,
  shouldRetry,
  calculateRetryDelay,
  ErrorCategory,
  type ClassifiedError,
  type RecoverabilityStatus,
} from './errors.js';

// =============================================================================
// Circuit Breaker
// =============================================================================
export {
  CircuitBreaker,
  createCircuitBreaker,
  CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerEvent,
  type CircuitBreakerListener,
  type CircuitBreakerResult,
} from './circuit-breaker.js';

// =============================================================================
// Nebula Client
// =============================================================================
export {
  NebulaClient,
  createNebulaClient,
  type NebulaClientConfig,
  type KernelSession,
  type ExecutionResult,
  type WriteCellResult,
} from './notebook/client.js';

// =============================================================================
// Unified Tools (single source of truth)
// =============================================================================
export {
  // Tool types
  type Tool,
  type ToolDefinition,
  type ToolResult,
  type MCPContent,

  // Tool collections
  allTools,
  toolsByName,
  toolCategories,
  notebookTools,
  kernelTools,
  executionTools,

  // Tool utilities
  getToolDefinitions,
  executeToolByName,
  executeToolForMCP,
  getTool,
  hasTool,
  getToolNamesByCategory,

  // Individual notebook tools
  readNotebookTool,
  readCellTool,
  readOutputTool,
  insertCellTool,
  updateCellTool,
  deleteCellTool,
  createNotebookTool,
  moveCellTool,
  duplicateCellTool,
  searchCellsTool,
  updateMetadataTool,

  // Individual kernel tools
  listKernelsTool,
  kernelStartTool,
  kernelStopTool,
  kernelRestartTool,
  kernelInterruptTool,

  // Individual execution tools
  executeCellTool,
} from './tools/index.js';

// =============================================================================
// Legacy exports (for backwards compatibility)
// =============================================================================
export {
  readNotebookCells,
  writeNotebookCell,
  executeCell,
  searchNotebookCells,
  readCellsToolDefinition,
  writeCellToolDefinition,
  executeCellToolDefinition,
  searchCellsToolDefinition,
  type ReadCellsParams,
  type ReadCellsResult,
  type WriteCellParams,
  type ExecuteCellParams,
  type ExecuteCellResult,
  type SearchCellsParams,
  type SearchCellsResult,
} from './notebook/tools.js';

/**
 * Reference to Gemini CLI tool names available in gemini-cli/tools/
 * These require the full Gemini CLI infrastructure to use.
 */
export const geminiCliToolNames = [
  'read_file',
  'write_file',
  'edit',           // smart string replacement
  'replace',        // smart-edit with LLM assistance
  'glob',           // find files by pattern
  'grep',           // search file contents
  'search_file_content', // ripgrep wrapper
  'list_directory', // ls
  'run_shell_command', // shell execution
  'web_fetch',      // fetch URL (needs API key)
  'google_web_search', // Google search (needs API key)
  'web_fetch_free', // fetch URL (no API key)
  'web_search_free', // DuckDuckGo search (no API key)
  'write_todos',    // todo management
  'memory',         // context memory
] as const;
