/**
 * Gemini CLI Tools Integration Index
 *
 * This file exports all tools and utilities needed for integrating
 * Gemini CLI tools into the Nexus Agentic IDE.
 */

// Config
export { Config, createConfig, getDefaultConfig } from './config/config.js';
export type { FileFilteringOptions, WorkspaceContext, FileExclusions, FileService, Storage } from './config/config.js';

// MessageBus
export { MessageBus, MessageBusType } from './confirmation-bus/message-bus.js';
export type { ToolConfirmationRequest, ToolConfirmationResponse } from './confirmation-bus/message-bus.js';

// Core tool types
export {
    Kind,
    BaseDeclarativeTool,
    BaseToolInvocation,
    ToolConfirmationOutcome,
    MUTATOR_KINDS,
} from './tools/tools.js';
export type {
    ToolInvocation,
    ToolBuilder,
    DeclarativeTool,
    AnyDeclarativeTool,
    ToolResult,
    ToolResultDisplay,
    FileDiff,
    DiffStat,
    TodoList,
    Todo,
    TodoStatus,
    ToolLocation,
    ToolCallConfirmationDetails,
    ToolEditConfirmationDetails,
    ToolExecuteConfirmationDetails,
    ToolMcpConfirmationDetails,
    ToolInfoConfirmationDetails,
} from './tools/tools.js';

// Tool Registry
export { ToolRegistry, DiscoveredTool, DISCOVERED_TOOL_PREFIX } from './tools/tool-registry.js';

// Tool names
export * from './tools/tool-names.js';

// Tool error types
export { ToolErrorType } from './tools/tool-error.js';

// Individual tools - Core file operations
export { ReadFileTool, type ReadFileToolParams } from './tools/read-file.js';
export { WriteFileTool, type WriteFileToolParams } from './tools/write-file.js';
export { EditTool, type EditToolParams, applyReplacement } from './tools/edit.js';
export { SmartEditTool, type EditToolParams as SmartEditToolParams } from './tools/smart-edit.js';
export { GlobTool, type GlobToolParams, sortFileEntries } from './tools/glob.js';
export { GrepTool, type GrepToolParams } from './tools/grep.js';
export { LSTool, type LSToolParams, type FileEntry } from './tools/ls.js';

// Shell tool
export { ShellTool, type ShellToolParams, ShellToolInvocation } from './tools/shell.js';

// Web tools
export { WebFetchTool, type WebFetchToolParams } from './tools/web-fetch.js';
export { WebSearchTool, type WebSearchToolParams } from './tools/web-search.js';
export { FreeWebSearchTool, type FreeWebSearchToolParams, type SearchResult } from './tools/free-web-search.js';
export { FreeWebFetchTool, type FreeWebFetchToolParams } from './tools/free-web-fetch.js';

// RipGrep tool (fast search)
export { RipGrepTool, type RipGrepToolParams } from './tools/ripGrep.js';

// Todo management
export { WriteTodosTool, type WriteTodosToolParams } from './tools/write-todos.js';

// Services
export { StandardFileSystemService, type FileSystemService } from './services/fileSystemService.js';
export { ShellExecutionService, type ShellExecutionConfig, type ShellOutputEvent, type ShellExecutionResult } from './services/shellExecutionService.js';

// Utils
export { debugLogger } from './utils/debugLogger.js';
export { getErrorMessage, isNodeError } from './utils/errors.js';
export { makeRelative, shortenPath } from './utils/paths.js';

// Policy
export { ApprovalMode } from './policy/types.js';

// IDE Client
export { IdeClient, type DiffUpdateResult } from './ide/ide-client.js';
