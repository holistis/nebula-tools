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
      items?: { type: string };
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
  [key: string]: unknown;  // Allow custom metadata
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
  // Convenience properties (also in metadata, but useful at top level)
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

// ============================================================================
// Notebook Operations - Unified format for UI and headless mode
// ============================================================================

/**
 * Insert a new cell at a specific position
 */
export interface InsertCellOp {
  type: 'insertCell';
  notebookPath: string;
  index: number; // -1 = append
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
  fromIndex?: number;
  toIndex?: number;
  /** Cell ID to move (alternative to fromIndex) */
  cellId?: string;
  /** Move after this cell ID (alternative to toIndex) */
  afterCellId?: string;
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
  // Truncation parameters for regular outputs
  max_lines?: number;
  max_chars?: number;
  // Separate limits for error outputs (tracebacks need more context)
  max_lines_error?: number;
  max_chars_error?: number;
  line_offset?: number;
  save_to_file?: boolean;
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

// =============================================================================
// Batch Operations (Phase 1 enhancements)
// =============================================================================

/**
 * Delete multiple cells by ID
 */
export interface DeleteCellsOp {
  type: 'deleteCells';
  notebookPath: string;
  cellIds: string[];
}

/**
 * Insert multiple cells at a position
 */
export interface InsertCellsOp {
  type: 'insertCells';
  notebookPath: string;
  cells: Array<{
    id?: string;
    type?: 'code' | 'markdown';
    content: string;
  }>;
  position?: number;
}

/**
 * Search cells by keyword in source and/or outputs
 */
export interface SearchCellsOp {
  type: 'searchCells';
  notebookPath: string;
  query: string;
  includeOutputs?: boolean;
  limit?: number;
}

/**
 * Clear outputs from cells
 */
export interface ClearOutputsOp {
  type: 'clearOutputs';
  notebookPath: string;
  cellId?: string;
  cellIds?: string[];
}

/**
 * Union of all notebook operations
 */
export type NotebookOperation =
  | InsertCellOp
  | DeleteCellOp
  | UpdateContentOp
  | UpdateMetadataOp
  | MoveCellOp
  | DuplicateCellOp
  | UpdateOutputsOp
  | CreateNotebookOp
  | ReadCellOp
  | ReadCellOutputOp
  | ClearNotebookOp
  | StartAgentSessionOp
  | EndAgentSessionOp
  // Batch operations (Phase 1 enhancements)
  | DeleteCellsOp
  | InsertCellsOp
  | SearchCellsOp
  | ClearOutputsOp;

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
  /** Cell outputs (for readCellOutput operation) - may include truncation metadata */
  outputs?: Array<CellOutput & {
    truncated?: boolean;
    truncation_reason?: string | null;
    total_lines?: number;
    total_chars?: number;
    returned_range?: { start_line: number; end_line: number; char_count: number };
    temp_file?: string;
    temp_file_size?: number;
    is_binary?: boolean;
  }>;
  /** Execution count (for readCellOutput operation) */
  executionCount?: number;
  /** Temp files created for large outputs (for readCellOutput operation) */
  temp_files?: string[];
  /** Number of cells deleted (for clearNotebook operation) */
  deletedCount?: number;
  /** Warning message (for session operations) */
  warning?: string;
  /** Session duration in ms (for endAgentSession operation) */
  sessionDuration?: number;

  // Batch operation fields (Phase 1 enhancements)
  /** Deleted cell IDs (for deleteCells operation) */
  deletedIds?: string[];
  /** IDs that were not found (for batch operations) */
  notFound?: string[];
  /** Total cells in notebook after operation */
  totalCells?: number;
  /** Inserted cell count (for insertCells operation) */
  insertedCount?: number;
  /** Inserted cell IDs (for insertCells operation) */
  insertedIds?: string[];
  /** Start index where cells were inserted */
  startIndex?: number;
  /** Move operation results */
  fromIndex?: number;
  toIndex?: number;
  /** Search results */
  query?: string;
  matchCount?: number;
  matches?: Array<{
    cellId: string;
    cellIndex: number;
    matchLocation: 'source' | 'output';
    matchLine?: number;
    outputIndex?: number;
    outputType?: string;
    preview: string;
  }>;
  hasMore?: boolean;
  /** Clear outputs results */
  clearedCount?: number;
  clearedIds?: string[];

  /** Extensible metadata container (Phase 2 ready) */
  metadata?: {
    /** Total cells in notebook after operation */
    totalCells?: number;
    /** Operation execution time in ms */
    operationTime?: number;
    // Future Phase 2 fields:
    // notebookHash?: string;  // For ETag caching
    // hasMore?: boolean;      // For pagination
    // offset?: number;        // For pagination
  };
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
