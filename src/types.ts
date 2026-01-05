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
 * Notebook cell representation
 */
export interface NotebookCell {
  id: string;
  type: 'code' | 'markdown';
  content: string;
  outputs?: CellOutput[];
  executionCount?: number;
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
