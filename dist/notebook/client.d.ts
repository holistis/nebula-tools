/**
 * Nebula Notebook Client - Unified API for Notebook Operations
 *
 * This client provides programmatic access to Nebula Notebook, enabling AI agents
 * and automation tools to manipulate notebooks through a consistent interface.
 *
 * ## Architecture
 *
 * The client routes operations through Nebula's Operation Router, which transparently
 * handles both UI-connected and headless modes:
 *
 * ```
 * NebulaClient → HTTP/WS → Operation Router → UI (WebSocket) or Headless (File)
 * ```
 *
 * From the client's perspective, both modes are identical - the router handles
 * the complexity of determining where to apply operations.
 *
 * ## Key Features
 *
 * - **Kernel Management**: Start, stop, restart, interrupt Jupyter kernels
 * - **Cell Operations**: Insert, delete, update, move, duplicate cells
 * - **Code Execution**: WebSocket streaming with real-time output capture
 * - **Agent Sessions**: Lock/unlock notebooks to prevent concurrent access
 * - **Dual Mode**: Works seamlessly with or without UI connected
 *
 * ## Usage
 *
 * ```typescript
 * const client = new NebulaClient({ baseUrl: 'http://localhost:8000' });
 *
 * // Start agent session (shows indicator in UI)
 * await client.startAgentSession(path, 'my-agent');
 *
 * // Insert a cell
 * const result = await client.insertCellOp(path, 0, {
 *   id: 'imports',
 *   type: 'code',
 *   content: 'import numpy as np'
 * });
 *
 * // Execute the cell
 * const execResult = await client.executeCell(path, sessionId, { cellIndex: 0 });
 *
 * // End session
 * await client.endAgentSession(path);
 * ```
 *
 * ## Error Handling
 *
 * All methods return `ToolResult<T>` with `success` boolean and either `data` or `error`:
 *
 * ```typescript
 * const result = await client.insertCellOp(path, 0, cell);
 * if (!result.success) {
 *   console.error(result.error);
 *   return;
 * }
 * console.log('Inserted cell:', result.data.cellId);
 * ```
 *
 * @see {@link https://github.com/jzthree/nebula-notebook/blob/main/docs/AGENTIC_ARCHITECTURE.md}
 * @module NebulaClient
 */
import type { Notebook, NotebookCell, CellOutput, CellMetadata, ToolResult } from '../types.js';
export interface NebulaClientConfig {
    /** Base URL for Nebula API (default: http://localhost:8000) */
    baseUrl?: string;
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
    /** Number of retries for transient errors (default: 3) */
    retries?: number;
    /** Optional agent session ID for lock enforcement */
    agentId?: string;
    /** Optional client name for lock metadata */
    clientName?: string;
    /** Optional client version for lock metadata */
    clientVersion?: string;
    /** Auto-start agent session for write operations (default: true if agentId provided) */
    autoStartAgentSession?: boolean;
}
export interface KernelSession {
    sessionId: string;
    kernelName: string;
    status: 'idle' | 'busy' | 'starting' | 'disconnected';
    filePath?: string;
}
export interface SessionInfo {
    id: string;
    kernel_name: string;
    status: string;
    file_path?: string;
    execution_count?: number;
}
export interface ExecutionResult {
    outputs: CellOutput[];
    executionCount?: number;
    success: boolean;
    error?: string;
}
export interface WriteCellResult {
    cellIndex: number;
    cellId: string;
    totalCells: number;
    idModified?: boolean;
    requestedId?: string;
}
export interface MetadataSchema {
    [key: string]: {
        type: 'string' | 'number' | 'boolean' | 'enum';
        values?: string[];
        description: string;
        agentMutable: boolean;
        default?: unknown;
    };
}
export interface SearchResult {
    cells: Array<{
        index: number;
        score: number;
        type: string;
        content: string;
        id: string;
    }>;
    totalCells: number;
}
/**
 * Client for Nebula Notebook headless API
 */
export declare class NebulaClient {
    private baseUrl;
    private timeout;
    private retries;
    private agentId?;
    private clientName?;
    private clientVersion?;
    private autoStartAgentSession;
    private activeAgentSessions;
    private agentSessionInFlight;
    private lastBackend?;
    private activeNotebookPath;
    private lastToolCallTimestamp;
    constructor(config?: NebulaClientConfig);
    private recordBackend;
    consumeLastBackend(): 'ui' | 'headless' | undefined;
    /**
     * Get the notebook path associated with the active agent session (if any).
     */
    getActiveNotebookPath(): string | null;
    private setActiveNotebookPath;
    private clearActiveNotebookPath;
    /**
     * Check if an error is retryable (network/connection errors)
     */
    private isRetryable;
    /**
     * Check if an error is a connection failure (server not reachable)
     */
    private isConnectionError;
    /**
     * Delay for retry backoff
     */
    private delay;
    /**
     * Fetch with automatic retry for transient errors
     */
    private fetch;
    /**
     * List available kernel specs with display names and versions
     */
    listKernels(): Promise<ToolResult<Array<{
        name: string;
        displayName: string;
        language: string;
    }>>>;
    /**
     * List active kernel sessions
     */
    listSessions(): Promise<ToolResult<SessionInfo[]>>;
    /**
     * Start a new kernel session
     */
    startKernel(kernelName?: string, filePath?: string): Promise<ToolResult<KernelSession>>;
    /**
     * Get or create a kernel session for a notebook file
     */
    getOrCreateKernelForFile(filePath: string, kernelName?: string): Promise<ToolResult<KernelSession>>;
    /**
     * Execute code in a kernel session (simple REST version)
     */
    executeCode(sessionId: string, code: string): Promise<ToolResult<ExecutionResult>>;
    /**
     * Execute code with WebSocket streaming for real-time output
     */
    executeCodeStreaming(sessionId: string, code: string, timeoutMs?: number): Promise<ToolResult<ExecutionResult>>;
    /**
     * Interrupt a running kernel
     */
    interruptKernel(sessionId: string): Promise<ToolResult<void>>;
    /**
     * Restart a kernel session
     */
    restartKernel(sessionId: string): Promise<ToolResult<void>>;
    /**
     * Shutdown a kernel session
     */
    shutdownKernel(sessionId: string): Promise<ToolResult<void>>;
    /**
     * Stop a kernel session (alias for shutdownKernel)
     */
    stopKernel(sessionId: string): Promise<ToolResult<void>>;
    /**
     * List files in a directory
     */
    listFiles(path?: string): Promise<ToolResult<{
        name: string;
        type: string;
    }[]>>;
    /**
     * Read a file's content
     */
    readFile(path: string): Promise<ToolResult<{
        content: string;
    }>>;
    /**
     * Write content to a file
     */
    writeFile(path: string, content: string): Promise<ToolResult<void>>;
    /**
     * Delete a file or directory
     */
    deleteFile(path: string): Promise<ToolResult<void>>;
    /**
     * Rename/move a file or directory
     */
    renameFile(oldPath: string, newPath: string): Promise<ToolResult<void>>;
    /**
     * Download a file as Buffer (supports both text and binary)
     * Uses the /fs/download endpoint that streams raw file content
     */
    downloadFile(serverPath: string): Promise<ToolResult<{
        content: Buffer;
    }>>;
    /**
     * Upload a file using multipart form data (supports binary)
     */
    uploadFile(destDir: string, content: Buffer, filename: string): Promise<ToolResult<void>>;
    /**
     * Get the metadata schema from Nebula API
     */
    getMetadataSchema(): Promise<ToolResult<MetadataSchema>>;
    /**
     * Execute a cell in a notebook and save the outputs back
     *
     * This combines read -> execute -> save into a single operation,
     * eliminating round-trips for the common iterative workflow.
     *
     * Supports both cellIndex (positional) and cellId (stable).
     * When save is true, outputs are saved incrementally during execution
     * so the notebook file reflects progress in real-time.
     */
    executeCell(path: string, sessionId: string, options?: {
        cellIndex?: number;
        cellId?: string;
        timeout?: number;
        save?: boolean;
        saveIntervalMs?: number;
    }): Promise<ToolResult<ExecutionResult & {
        cellIndex: number;
        cellId: string;
    }>>;
    /**
     * Execute code with incremental saves via operation router
     * Outputs are sent to UI (if connected) or saved to file via updateOutputs operation
     */
    private executeWithIncrementalSave;
    /**
     * Search cells in a notebook by keyword
     */
    searchCells(path: string, query: string, limit?: number): Promise<ToolResult<SearchResult>>;
    /**
     * Generate code using LLM
     */
    generateCode(prompt: string, context?: string, provider?: string, model?: string): Promise<ToolResult<string>>;
    /**
     * Chat with notebook context
     */
    chat(message: string, notebookContext: string, history?: {
        role: string;
        content: string;
    }[], provider?: string, model?: string): Promise<ToolResult<string>>;
    private parseJupyterOutput;
    private toJupyterOutput;
    /**
     * Apply a notebook operation through the operation router.
     *
     * Operations are routed to:
     * - Connected UI via WebSocket (if available) - UI applies and saves
     * - Headless manager (file-based) otherwise
     *
     * From the agent's perspective, both modes behave identically.
     */
    applyOperation(operation: import('../types.js').NotebookOperation): Promise<ToolResult<import('../types.js').OperationResult>>;
    private isWriteOperation;
    private ensureAgentSession;
    /**
     * Read notebook through the operation router.
     *
     * If UI is connected, requests current state from UI.
     * Otherwise reads from file.
     */
    readNotebookViaRouter(path: string, options?: {
        includeOutputs?: boolean;
        maxLines?: number;
        maxChars?: number;
        maxLinesError?: number;
        maxCharsError?: number;
    }): Promise<ToolResult<Notebook>>;
    /**
     * Check if a UI is connected for a notebook path
     */
    hasUI(path: string): Promise<boolean>;
    /**
     * Create a new notebook using the operation router.
     *
     * Routes to UI if connected (UI creates file and tracks mtime),
     * otherwise creates via headless manager.
     *
     * @param path - Path to create the notebook
     * @param options - Optional settings
     * @param options.overwrite - Allow overwriting existing file (default: false)
     * @param options.kernelName - Kernel name (default: 'python3')
     * @param options.kernelDisplayName - Display name for kernel
     * @returns Result with path and mtime on success
     */
    createNotebookOp(path: string, options?: {
        overwrite?: boolean;
        kernelName?: string;
        kernelDisplayName?: string;
    }): Promise<ToolResult<{
        path?: string;
        mtime?: number;
        popupBlocked?: boolean;
        popupMessage?: string;
    }>>;
    /**
     * Insert a cell using the operation router
     */
    insertCellOp(path: string, index: number, cell: {
        id: string;
        type: 'code' | 'markdown';
        content: string;
        metadata?: CellMetadata;
    }): Promise<ToolResult<WriteCellResult>>;
    /**
     * Delete a cell using the operation router
     */
    deleteCellOp(path: string, options: {
        cellId?: string;
        cellIndex?: number;
    }): Promise<ToolResult<void>>;
    /**
     * Update cell content using the operation router
     */
    updateContentOp(path: string, cellId: string, content: string): Promise<ToolResult<void>>;
    /**
     * Update cell metadata using the operation router
     */
    updateMetadataOp(path: string, cellId: string, changes: Record<string, unknown>): Promise<ToolResult<void>>;
    /**
     * Move a cell using the operation router
     *
     * Supports two modes:
     * 1. By index: moveCellOp(path, 0, 5) - move from index 0 to 5
     * 2. By ID: moveCellOp(path, 0, 0, { cellId: 'cell-1', afterCellId: 'cell-2' })
     */
    moveCellOp(path: string, fromIndex: number, toIndex: number, options?: {
        cellId?: string;
        afterCellId?: string;
    }): Promise<ToolResult<{
        cellId?: string;
        fromIndex: number;
        toIndex: number;
    }>>;
    /**
     * Duplicate a cell using the operation router
     */
    duplicateCellOp(path: string, cellIndex: number, newCellId: string): Promise<ToolResult<{
        cellIndex: number;
        cellId: string;
        metadata?: {
            totalCells?: number;
            operationTime?: number;
        };
    }>>;
    /**
     * Update cell outputs using the operation router
     */
    updateOutputsOp(path: string, cellId: string, outputs: CellOutput[], executionCount?: number): Promise<ToolResult<void>>;
    /**
     * Read a single cell using the operation router.
     *
     * More efficient than readNotebook when you only need one cell.
     * Routes to UI if connected, otherwise reads from file.
     */
    readCellOp(path: string, options: {
        cellId?: string;
        cellIndex?: number;
    }): Promise<ToolResult<{
        cell: NotebookCell;
        cellIndex: number;
    }>>;
    /**
     * Read cell outputs using the operation router.
     *
     * More efficient than readNotebook when you only need outputs.
     * Routes to UI if connected, otherwise reads from file.
     *
     * Supports truncation options for large outputs:
     * - maxLines: Max lines for regular output (default: 100)
     * - maxChars: Max characters for regular output (default: 10000)
     * - maxLinesError: Max lines for error output (default: 200)
     * - maxCharsError: Max characters for error output (default: 20000)
     * - lineOffset: Skip first N lines for pagination
     * - saveToFile: Force save full output to temp file
     */
    readCellOutputOp(path: string, options: {
        cellId?: string;
        cellIndex?: number;
        maxLines?: number;
        maxChars?: number;
        maxLinesError?: number;
        maxCharsError?: number;
        lineOffset?: number;
        saveToFile?: boolean;
    }): Promise<ToolResult<{
        outputs: Array<CellOutput & {
            truncated?: boolean;
            truncation_reason?: string | null;
            total_lines?: number;
            total_chars?: number;
            returned_range?: {
                start_line: number;
                end_line: number;
                char_count: number;
            };
            temp_file?: string;
            temp_file_size?: number;
            is_binary?: boolean;
        }>;
        executionCount?: number;
        executionStatus?: 'idle' | 'busy' | 'error';
        cellId: string;
        cellIndex: number;
        temp_files?: string[];
    }>>;
    /**
     * Clear all cells from a notebook using the operation router
     *
     * This is the proper way to clear a notebook - routes to UI if connected
     * or falls back to headless mode. Returns the number of cells deleted.
     */
    clearNotebookOp(path: string): Promise<ToolResult<{
        deletedCount: number;
        metadata?: {
            totalCells?: number;
            operationTime?: number;
        };
    }>>;
    /**
     * Delete multiple cells by ID in a single operation
     *
     * More efficient than multiple single deletes - handles index shifting automatically.
     */
    deleteCellsOp(path: string, cellIds: string[]): Promise<ToolResult<{
        deletedCount: number;
        deletedIds: string[];
        notFound?: string[];
        totalCells: number;
    }>>;
    /**
     * Insert multiple cells at a position in a single operation
     *
     * More efficient than multiple single inserts.
     */
    insertCellsOp(path: string, cells: Array<{
        id?: string;
        type?: 'code' | 'markdown';
        content: string;
    }>, position?: number): Promise<ToolResult<{
        insertedCount: number;
        insertedIds: string[];
        startIndex: number;
        totalCells: number;
    }>>;
    /**
     * Search cells with optional output search
     *
     * Enhanced version that can search in cell outputs as well as source code.
     */
    searchCellsOp(path: string, query: string, options?: {
        includeOutputs?: boolean;
        limit?: number;
    }): Promise<ToolResult<{
        query: string;
        matchCount: number;
        matches: Array<{
            cellId: string;
            cellIndex: number;
            matchLocation: 'source' | 'output';
            matchLine?: number;
            outputIndex?: number;
            outputType?: string;
            preview: string;
        }>;
        hasMore: boolean;
    }>>;
    /**
     * Clear outputs from one or more cells
     *
     * Useful for cleanup before sharing notebooks.
     */
    clearOutputsOp(path: string, cellIds?: string[]): Promise<ToolResult<{
        clearedCount: number;
        clearedIds: string[];
        notFound?: string[];
    }>>;
    /**
     * Execute a cell through the operation router
     *
     * Routes to UI if connected (shows running indicator) or executes in headless mode.
     * For long-running cells, returns with status="busy" after maxWait seconds.
     * Use readCellOutputOp with max_wait to poll for more output.
     */
    executeCellOp(path: string, options: {
        cellId?: string;
        cellIndex?: number;
        sessionId?: string;
        maxWait?: number;
        saveOutputs?: boolean;
    }): Promise<ToolResult<{
        cellId: string;
        cellIndex: number;
        executionStatus: 'idle' | 'busy' | 'error';
        executionCount?: number;
        outputs: Array<import('../types.js').CellOutput>;
        executionTime?: number;
        sessionId?: string;
        error?: string;
    }>>;
    /**
     * Start an agent session (locks notebook for agent use).
     * If a session is already active, returns a warning but still starts a new session.
     *
     * @param path - Path to the notebook file
     * @param agentId - Optional identifier for this agent session
     * @param force - If true, forcibly end any existing session and steal the lock.
     *                Use only with explicit user permission.
     * @param lastSessionTimestamp - Optional timestamp (ms) to fetch updates since last session.
     */
    startAgentSession(path: string, agentId?: string, force?: boolean, lastSessionTimestamp?: number): Promise<ToolResult<{
        warning?: string;
        previousSessionDuration?: number;
        updatesSince?: import('../types.js').UpdateSummary[];
    }>>;
    /**
     * End an agent session (unlocks notebook).
     * Should be called when agent work is complete.
     */
    endAgentSession(path: string): Promise<ToolResult<{
        sessionDuration?: number;
        warning?: string;
    }>>;
    /**
     * List available Python environments on the system.
     *
     * Discovers Python installations from:
     * - System Python
     * - Conda environments
     * - pyenv versions
     * - Virtual environments
     * - Homebrew Python
     */
    listPythonEnvironments(refresh?: boolean): Promise<ToolResult<Array<{
        name: string;
        path: string;
        version?: string;
        source: string;
        isActive?: boolean;
    }>>>;
    /**
     * Get detailed information about a Python environment.
     *
     * @param pythonPath - Path to the Python executable (optional, uses system Python if not provided)
     */
    getPythonInfo(pythonPath?: string): Promise<ToolResult<{
        path: string;
        version: string;
        packages?: string[];
    }>>;
    /**
     * Get the last tool call timestamp for a notebook path.
     * Used internally to track user changes between tool calls.
     */
    getLastToolCallTimestamp(path: string): number;
    /**
     * Record the current time as the last tool call for a notebook path.
     * Called automatically after each operation.
     */
    recordToolCallTimestamp(path: string, timestamp?: number): void;
    /**
     * Get updates since the last tool call for a notebook.
     *
     * Returns summaries of edits and events since the last recorded
     * tool call timestamp (no source filtering).
     */
    getUpdatesSinceOp(path: string): Promise<ToolResult<{
        updates: import('../types.js').UpdateSummary[];
        sinceTimestamp: number;
        serverTimestamp: number;
    }>>;
}
/**
 * Create a new Nebula client
 */
export declare function createNebulaClient(config?: NebulaClientConfig): NebulaClient;
//# sourceMappingURL=client.d.ts.map