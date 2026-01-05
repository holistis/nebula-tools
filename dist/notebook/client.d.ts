/**
 * Nebula Notebook Client - headless API for notebook operations
 *
 * Provides programmatic access to Nebula Notebook's REST API for:
 * - Kernel management (start, stop, restart, interrupt)
 * - Notebook operations (read, write, search)
 * - Code execution with WebSocket streaming
 * - File system operations
 */
import type { Notebook, CellOutput, ToolResult } from '../types.js';
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
    totalCells: number;
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
     * List available kernel specs
     */
    listKernels(): Promise<ToolResult<string[]>>;
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
     * Read a notebook file
     */
    readNotebook(path: string): Promise<ToolResult<Notebook>>;
    /**
     * Write a notebook file
     */
    writeNotebook(notebook: Notebook): Promise<ToolResult<void>>;
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
     * Write (insert or update) a cell in a notebook
     */
    writeCell(path: string, cellIndex: number, content: string, cellType?: 'code' | 'markdown'): Promise<ToolResult<WriteCellResult>>;
    /**
     * Delete a cell from a notebook
     */
    deleteCell(path: string, cellIndex: number): Promise<ToolResult<{
        totalCells: number;
    }>>;
    /**
     * Execute a cell in a notebook and save the outputs back
     *
     * This combines read -> execute -> save into a single operation,
     * eliminating round-trips for the common iterative workflow.
     */
    executeCell(path: string, cellIndex: number, sessionId: string, options?: {
        timeout?: number;
        save?: boolean;
    }): Promise<ToolResult<ExecutionResult & {
        cellIndex: number;
    }>>;
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
}
/**
 * Create a new Nebula client
 */
export declare function createNebulaClient(config?: NebulaClientConfig): NebulaClient;
//# sourceMappingURL=client.d.ts.map