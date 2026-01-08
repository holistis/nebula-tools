/**
 * Nebula Notebook Client - headless API for notebook operations
 *
 * Provides programmatic access to Nebula Notebook's REST API for:
 * - Kernel management (start, stop, restart, interrupt)
 * - Notebook operations (read, write, search)
 * - Code execution with WebSocket streaming
 * - File system operations
 */
import type { Notebook, NotebookCell, CellOutput, CellMetadata, ToolResult } from '../types.js';
export interface NebulaClientConfig {
    /** Base URL for Nebula API (default: http://localhost:8000) */
    baseUrl?: string;
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
    /** Number of retries for transient errors (default: 3) */
    retries?: number;
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
    constructor(config?: NebulaClientConfig);
    /**
     * Check if an error is retryable (network/connection errors)
     */
    private isRetryable;
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
    /**
     * Read notebook through the operation router.
     *
     * If UI is connected, requests current state from UI.
     * Otherwise reads from file.
     */
    readNotebookViaRouter(path: string): Promise<ToolResult<Notebook>>;
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
     */
    moveCellOp(path: string, fromIndex: number, toIndex: number): Promise<ToolResult<void>>;
    /**
     * Duplicate a cell using the operation router
     */
    duplicateCellOp(path: string, cellIndex: number, newCellId: string): Promise<ToolResult<{
        cellIndex: number;
        cellId: string;
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
     */
    readCellOutputOp(path: string, options: {
        cellId?: string;
        cellIndex?: number;
    }): Promise<ToolResult<{
        outputs: CellOutput[];
        executionCount?: number;
        cellId: string;
        cellIndex: number;
    }>>;
    /**
     * Clear all cells from a notebook using the operation router
     *
     * This is the proper way to clear a notebook - routes to UI if connected
     * or falls back to headless mode. Returns the number of cells deleted.
     */
    clearNotebookOp(path: string): Promise<ToolResult<{
        deletedCount: number;
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
}
/**
 * Create a new Nebula client
 */
export declare function createNebulaClient(config?: NebulaClientConfig): NebulaClient;
//# sourceMappingURL=client.d.ts.map