/**
 * Common types for nebula-tools
 */
/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}
/**
 * Tool definition for agent integration
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            required?: boolean;
            items?: {
                type: string;
            };
        }>;
        required: string[];
    };
}
/**
 * Generic tool interface
 */
export interface Tool<TParams, TResult> {
    definition: ToolDefinition;
    execute(params: TParams, options?: ExecuteOptions): Promise<ToolResult<TResult>>;
}
/**
 * Options for tool execution
 */
export interface ExecuteOptions {
    cwd?: string;
    signal?: AbortSignal;
    timeout?: number;
}
/**
 * Grep match result
 */
export interface GrepMatch {
    filePath: string;
    lineNumber: number;
    content: string;
}
/**
 * Glob file entry
 */
export interface GlobEntry {
    path: string;
    relativePath: string;
    mtimeMs?: number;
}
/**
 * Cell metadata for Jupyter notebooks
 */
export interface CellMetadata {
    tags?: string[];
    collapsed?: boolean;
    scrolled?: boolean | 'auto';
    name?: string;
    [key: string]: unknown;
}
/**
 * Notebook cell representation
 */
export interface NotebookCell {
    id: string;
    type: 'code' | 'markdown';
    content: string;
    outputs?: CellOutput[];
    executionCount?: number;
    metadata?: CellMetadata;
    scrolled?: boolean;
    scrolledHeight?: number;
}
/**
 * Cell output representation
 */
export interface CellOutput {
    type: 'stdout' | 'stderr' | 'image' | 'html' | 'error';
    content: string;
}
/**
 * Notebook representation
 */
export interface Notebook {
    path: string;
    cells: NotebookCell[];
    metadata?: Record<string, unknown>;
}
/**
 * Insert a new cell at a specific position
 */
export interface InsertCellOp {
    type: 'insertCell';
    notebookPath: string;
    index: number;
    cell: {
        id: string;
        type: 'code' | 'markdown';
        content: string;
        metadata?: CellMetadata;
    };
}
/**
 * Delete a cell by ID or index
 */
export interface DeleteCellOp {
    type: 'deleteCell';
    notebookPath: string;
    cellId?: string;
    cellIndex?: number;
}
/**
 * Update cell content
 */
export interface UpdateContentOp {
    type: 'updateContent';
    notebookPath: string;
    cellId: string;
    content: string;
}
/**
 * Update cell metadata (type, scrolled, etc.)
 */
export interface UpdateMetadataOp {
    type: 'updateMetadata';
    notebookPath: string;
    cellId: string;
    changes: Record<string, unknown>;
}
/**
 * Move a cell from one position to another
 */
export interface MoveCellOp {
    type: 'moveCell';
    notebookPath: string;
    fromIndex: number;
    toIndex: number;
}
/**
 * Duplicate a cell
 */
export interface DuplicateCellOp {
    type: 'duplicateCell';
    notebookPath: string;
    cellIndex: number;
    newCellId: string;
}
/**
 * Update cell outputs (typically after execution)
 */
export interface UpdateOutputsOp {
    type: 'updateOutputs';
    notebookPath: string;
    cellId: string;
    outputs: CellOutput[];
    executionCount?: number;
}
/**
 * Create a new notebook
 */
export interface CreateNotebookOp {
    type: 'createNotebook';
    notebookPath: string;
    overwrite?: boolean;
    kernelName?: string;
    kernelDisplayName?: string;
}
/**
 * Read a single cell by ID or index
 */
export interface ReadCellOp {
    type: 'readCell';
    notebookPath: string;
    cellId?: string;
    cellIndex?: number;
}
/**
 * Read cell outputs by ID or index
 */
export interface ReadCellOutputOp {
    type: 'readCellOutput';
    notebookPath: string;
    cellId?: string;
    cellIndex?: number;
}
/**
 * Clear all cells from a notebook
 */
export interface ClearNotebookOp {
    type: 'clearNotebook';
    notebookPath: string;
}
/**
 * Start an agent session (locks notebook for agent use)
 */
export interface StartAgentSessionOp {
    type: 'startAgentSession';
    notebookPath: string;
    agentId?: string;
}
/**
 * End an agent session (unlocks notebook)
 */
export interface EndAgentSessionOp {
    type: 'endAgentSession';
    notebookPath: string;
}
/**
 * Union of all notebook operations
 */
export type NotebookOperation = InsertCellOp | DeleteCellOp | UpdateContentOp | UpdateMetadataOp | MoveCellOp | DuplicateCellOp | UpdateOutputsOp | CreateNotebookOp | ReadCellOp | ReadCellOutputOp | ClearNotebookOp | StartAgentSessionOp | EndAgentSessionOp;
/**
 * Result of applying an operation
 */
export interface OperationResult {
    success: boolean;
    /** Actual cell ID (may differ from requested if auto-fixed) */
    cellId?: string;
    /** Cell index after operation */
    cellIndex?: number;
    /** Whether ID was modified due to conflict */
    idModified?: boolean;
    /** Original requested ID if modified */
    requestedId?: string;
    /** Error message if failed */
    error?: string;
    /** Path of created/modified notebook (for createNotebook) */
    path?: string;
    /** File modification time (for createNotebook) */
    mtime?: number;
    /** Cell data (for readCell operation) */
    cell?: NotebookCell;
    /** Cell outputs (for readCellOutput operation) */
    outputs?: CellOutput[];
    /** Execution count (for readCellOutput operation) */
    executionCount?: number;
    /** Number of cells deleted (for clearNotebook operation) */
    deletedCount?: number;
    /** Warning message (for session operations) */
    warning?: string;
    /** Session duration in ms (for endAgentSession operation) */
    sessionDuration?: number;
}
/**
 * Message sent to UI to apply an operation
 */
export interface OperationMessage {
    type: 'operation';
    operation: NotebookOperation;
    /** Unique ID for tracking response */
    requestId: string;
}
/**
 * Response from UI after applying operation
 */
export interface OperationResponse {
    type: 'operationResult';
    requestId: string;
    result: OperationResult;
}
//# sourceMappingURL=types.d.ts.map