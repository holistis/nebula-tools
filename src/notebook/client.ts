/**
 * Nebula Notebook Client - headless API for notebook operations
 *
 * Provides programmatic access to Nebula Notebook's REST API for:
 * - Kernel management (start, stop, restart, interrupt)
 * - Notebook operations (read, write, search)
 * - Code execution with WebSocket streaming
 * - File system operations
 */

import type { Notebook, NotebookCell, CellOutput, ToolResult } from '../types.js';

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
export class NebulaClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(config: NebulaClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:8000';
    this.timeout = config.timeout || 30000;
    this.retries = config.retries ?? 3;
  }

  /**
   * Check if an error is retryable (network/connection errors)
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('network') ||
        msg.includes('connection') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('timeout')
      );
    }
    return false;
  }

  /**
   * Delay for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch with automatic retry for transient errors
   */
  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ToolResult<T>> {
    let lastError: string = 'Unknown error';

    for (let attempt = 0; attempt < this.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.text();
          // Don't retry 4xx errors (client errors)
          if (response.status >= 400 && response.status < 500) {
            return { success: false, error: `API error ${response.status}: ${error}` };
          }
          lastError = `API error ${response.status}: ${error}`;
          // Retry 5xx errors
          if (attempt < this.retries - 1) {
            await this.delay(1000 * (attempt + 1));
            continue;
          }
          return { success: false, error: lastError };
        }

        const data = await response.json();
        return { success: true, data: data as T };
      } catch (e) {
        clearTimeout(timeoutId);

        if (e instanceof Error && e.name === 'AbortError') {
          lastError = 'Request timeout';
        } else {
          lastError = `Request failed: ${e instanceof Error ? e.message : String(e)}`;
        }

        // Retry if retryable and not last attempt
        if (this.isRetryable(e) && attempt < this.retries - 1) {
          await this.delay(1000 * (attempt + 1));
          continue;
        }

        return { success: false, error: lastError };
      }
    }

    return { success: false, error: lastError };
  }

  // ===========================================================================
  // Kernel Operations
  // ===========================================================================

  /**
   * List available kernel specs
   */
  async listKernels(): Promise<ToolResult<string[]>> {
    const result = await this.fetch<{ kernels: Array<{ name: string }> }>('/api/kernels');
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.kernels.map((k) => k.name) ?? [] };
  }

  /**
   * List active kernel sessions
   */
  async listSessions(): Promise<ToolResult<SessionInfo[]>> {
    const result = await this.fetch<{ sessions: SessionInfo[] }>('/api/kernels/sessions');
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.sessions ?? [] };
  }

  /**
   * Start a new kernel session
   */
  async startKernel(kernelName: string = 'python3', filePath?: string): Promise<ToolResult<KernelSession>> {
    const result = await this.fetch<{ session_id: string; kernel_name: string }>('/api/kernels/start', {
      method: 'POST',
      body: JSON.stringify({ kernel_name: kernelName, file_path: filePath }),
    });
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      data: {
        sessionId: result.data!.session_id,
        kernelName: result.data!.kernel_name,
        status: 'idle',
        filePath,
      },
    };
  }

  /**
   * Get or create a kernel session for a notebook file
   */
  async getOrCreateKernelForFile(filePath: string, kernelName?: string): Promise<ToolResult<KernelSession>> {
    const result = await this.fetch<{ session_id: string; kernel_name: string; file_path: string }>(
      '/api/kernels/for-file',
      {
        method: 'POST',
        body: JSON.stringify({ file_path: filePath, kernel_name: kernelName }),
      }
    );
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      data: {
        sessionId: result.data!.session_id,
        kernelName: result.data!.kernel_name,
        status: 'idle',
        filePath: result.data!.file_path,
      },
    };
  }

  /**
   * Execute code in a kernel session (simple REST version)
   */
  async executeCode(sessionId: string, code: string): Promise<ToolResult<ExecutionResult>> {
    return this.fetch<ExecutionResult>(`/api/kernels/${sessionId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /**
   * Execute code with WebSocket streaming for real-time output
   */
  async executeCodeStreaming(
    sessionId: string,
    code: string,
    timeoutMs: number = 60000
  ): Promise<ToolResult<ExecutionResult>> {
    return new Promise((resolve) => {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/api/kernels/${sessionId}/ws`;
      const outputs: CellOutput[] = [];
      let executionCount: number | undefined;
      let hasError = false;
      let errorMessage: string | undefined;

      // Use dynamic import for ws in Node.js environment
      const connectWs = async () => {
        try {
          // Try browser WebSocket first
          const WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : (await import('ws')).default;
          const ws = new WebSocketImpl(wsUrl);

          const timeout = setTimeout(() => {
            ws.close();
            resolve({
              success: false,
              error: `Execution timeout after ${timeoutMs / 1000}s`,
              data: { outputs, success: false, executionCount },
            });
          }, timeoutMs);

          ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'execute', code }));
          };

          ws.onmessage = (event: { data: string | Buffer }) => {
            try {
              const data = typeof event.data === 'string' ? event.data : event.data.toString();
              const msg = JSON.parse(data);

              if (msg.type === 'output') {
                outputs.push(this.parseJupyterOutput(msg.output));
              } else if (msg.type === 'result') {
                executionCount = msg.result?.execution_count;
                if (msg.result?.outputs) {
                  outputs.push(...msg.result.outputs.map((o: any) => this.parseJupyterOutput(o)));
                }
              } else if (msg.type === 'error') {
                hasError = true;
                errorMessage = msg.error;
                outputs.push({ type: 'error', content: msg.error || 'Unknown error' });
              } else if (msg.type === 'status' && msg.status === 'idle') {
                clearTimeout(timeout);
                ws.close();
                resolve({
                  success: !hasError,
                  data: { outputs, success: !hasError, executionCount, error: errorMessage },
                });
              }
            } catch (e) {
              // Ignore parse errors for non-JSON messages
            }
          };

          ws.onerror = (error: any) => {
            clearTimeout(timeout);
            ws.close();
            resolve({
              success: false,
              error: `WebSocket error: ${error.message || 'Unknown error'}`,
            });
          };

          ws.onclose = () => {
            clearTimeout(timeout);
          };
        } catch (e) {
          // Fall back to REST API if WebSocket fails
          const result = await this.executeCode(sessionId, code);
          resolve(result);
        }
      };

      connectWs();
    });
  }

  /**
   * Interrupt a running kernel
   */
  async interruptKernel(sessionId: string): Promise<ToolResult<void>> {
    return this.fetch<void>(`/api/kernels/${sessionId}/interrupt`, {
      method: 'POST',
    });
  }

  /**
   * Restart a kernel session
   */
  async restartKernel(sessionId: string): Promise<ToolResult<void>> {
    return this.fetch<void>(`/api/kernels/${sessionId}/restart`, {
      method: 'POST',
    });
  }

  /**
   * Shutdown a kernel session
   */
  async shutdownKernel(sessionId: string): Promise<ToolResult<void>> {
    return this.fetch<void>(`/api/kernels/${sessionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Stop a kernel session (alias for shutdownKernel)
   */
  async stopKernel(sessionId: string): Promise<ToolResult<void>> {
    return this.shutdownKernel(sessionId);
  }

  // ===========================================================================
  // File Operations
  // ===========================================================================

  /**
   * Read a notebook file
   */
  async readNotebook(path: string): Promise<ToolResult<Notebook>> {
    interface ReadFileResponse {
      path: string;
      type: 'text' | 'notebook' | 'binary';
      content: any;  // string for text, object for notebook, null for binary
    }

    const result = await this.fetch<ReadFileResponse>(`/api/fs/read?path=${encodeURIComponent(path)}`);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    try {
      // API returns parsed JSON object for notebooks, string for text files
      const notebook = result.data!.type === 'notebook'
        ? result.data!.content
        : JSON.parse(result.data!.content);
      const cells: NotebookCell[] = (notebook.cells || []).map((cell: any, index: number) => ({
        id: cell.metadata?.nebula_id || `cell-${index}`,
        type: cell.cell_type === 'code' ? 'code' : 'markdown',
        content: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
        outputs: (cell.outputs || []).map((output: any) => this.parseJupyterOutput(output)),
        executionCount: cell.execution_count,
      }));

      return {
        success: true,
        data: {
          path,
          cells,
          metadata: notebook.metadata,
        },
      };
    } catch (e) {
      return { success: false, error: `Failed to parse notebook: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /**
   * Write a notebook file
   */
  async writeNotebook(notebook: Notebook): Promise<ToolResult<void>> {
    const jupyterNotebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: notebook.metadata || {},
      cells: notebook.cells.map((cell) => ({
        cell_type: cell.type,
        source: cell.content,
        metadata: { nebula_id: cell.id },
        outputs: cell.type === 'code' ? (cell.outputs || []).map((o) => this.toJupyterOutput(o)) : undefined,
        execution_count: cell.type === 'code' ? cell.executionCount : undefined,
      })),
    };

    return this.fetch<void>('/api/fs/write', {
      method: 'POST',
      body: JSON.stringify({
        path: notebook.path,
        content: JSON.stringify(jupyterNotebook, null, 2),
      }),
    });
  }

  /**
   * List files in a directory
   */
  async listFiles(path: string = '.'): Promise<ToolResult<{ name: string; type: string }[]>> {
    interface ListDirResponse {
      path: string;
      parent: string | null;
      mtime: number;
      items: Array<{
        name: string;
        path: string;
        isDirectory: boolean;
        size: string;
        modified: number;
        extension: string;
        fileType: string;
      }>;
    }

    const result = await this.fetch<ListDirResponse>(`/api/fs/list?path=${encodeURIComponent(path)}`);
    if (!result.success) return { success: false, error: result.error };

    // Transform the response to match expected format
    const items = result.data!.items.map((item) => ({
      name: item.name,
      type: item.isDirectory ? 'directory' : item.fileType || 'file',
    }));

    return { success: true, data: items };
  }

  /**
   * Read a file's content
   */
  async readFile(path: string): Promise<ToolResult<{ content: string }>> {
    interface ReadFileResponse {
      path: string;
      type: 'text' | 'notebook' | 'binary';
      content: any;
      message?: string;
    }

    const result = await this.fetch<ReadFileResponse>(`/api/fs/read?path=${encodeURIComponent(path)}`);
    if (!result.success) return { success: false, error: result.error };

    // Handle binary files
    if (result.data!.type === 'binary') {
      return { success: false, error: result.data!.message || 'Binary file cannot be read as text' };
    }

    // Handle notebook files (return as JSON string)
    if (result.data!.type === 'notebook') {
      return { success: true, data: { content: JSON.stringify(result.data!.content, null, 2) } };
    }

    // Handle text files
    return { success: true, data: { content: result.data!.content } };
  }

  /**
   * Write content to a file
   */
  async writeFile(path: string, content: string): Promise<ToolResult<void>> {
    return this.fetch<void>('/api/fs/write', {
      method: 'POST',
      body: JSON.stringify({ path, content, file_type: 'text' }),
    });
  }

  // ===========================================================================
  // Notebook Cell Operations
  // ===========================================================================

  /**
   * Write (insert or update) a cell in a notebook
   */
  async writeCell(
    path: string,
    cellIndex: number,
    content: string,
    cellType: 'code' | 'markdown' = 'code'
  ): Promise<ToolResult<WriteCellResult>> {
    // Read the notebook first
    const notebookResult = await this.readNotebook(path);
    if (!notebookResult.success) {
      return { success: false, error: notebookResult.error };
    }

    const notebook = notebookResult.data!;
    const newCell: NotebookCell = {
      id: `cell-${Date.now()}`,
      type: cellType,
      content,
    };

    if (cellIndex === -1) {
      // Append to end
      notebook.cells.push(newCell);
    } else if (cellIndex >= 0 && cellIndex < notebook.cells.length) {
      // Update existing cell
      notebook.cells[cellIndex] = { ...notebook.cells[cellIndex], content, type: cellType };
    } else {
      return { success: false, error: `Cell index ${cellIndex} out of range` };
    }

    // Write back
    const writeResult = await this.writeNotebook(notebook);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error };
    }

    return {
      success: true,
      data: {
        cellIndex: cellIndex === -1 ? notebook.cells.length - 1 : cellIndex,
        totalCells: notebook.cells.length,
      },
    };
  }

  /**
   * Delete a cell from a notebook
   */
  async deleteCell(path: string, cellIndex: number): Promise<ToolResult<{ totalCells: number }>> {
    const notebookResult = await this.readNotebook(path);
    if (!notebookResult.success) {
      return { success: false, error: notebookResult.error };
    }

    const notebook = notebookResult.data!;
    if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return { success: false, error: `Cell index ${cellIndex} out of range` };
    }

    notebook.cells.splice(cellIndex, 1);

    const writeResult = await this.writeNotebook(notebook);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error };
    }

    return { success: true, data: { totalCells: notebook.cells.length } };
  }

  /**
   * Search cells in a notebook by keyword
   */
  async searchCells(path: string, query: string, limit: number = 5): Promise<ToolResult<SearchResult>> {
    const notebookResult = await this.readNotebook(path);
    if (!notebookResult.success) {
      return { success: false, error: notebookResult.error };
    }

    const notebook = notebookResult.data!;
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);

    if (terms.length === 0) {
      return { success: true, data: { cells: [], totalCells: notebook.cells.length } };
    }

    // Score each cell
    const scored = notebook.cells.map((cell, index) => {
      const content = cell.content.toLowerCase();
      let score = 0;

      for (const term of terms) {
        const matches = (content.match(new RegExp(term, 'g')) || []).length;
        score += matches;
      }

      // Boost exact phrase matches
      if (content.includes(query.toLowerCase())) {
        score += 10;
      }

      return { ...cell, index, score };
    });

    // Filter and sort by score
    const matches = scored
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      success: true,
      data: {
        cells: matches.map((m) => ({
          index: m.index,
          score: m.score,
          type: m.type,
          content: m.content,
          id: m.id,
        })),
        totalCells: notebook.cells.length,
      },
    };
  }

  // ===========================================================================
  // LLM Operations
  // ===========================================================================

  /**
   * Generate code using LLM
   */
  async generateCode(
    prompt: string,
    context?: string,
    provider?: string,
    model?: string
  ): Promise<ToolResult<string>> {
    return this.fetch<string>('/api/llm/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        context,
        provider,
        model,
      }),
    });
  }

  /**
   * Chat with notebook context
   */
  async chat(
    message: string,
    notebookContext: string,
    history?: { role: string; content: string }[],
    provider?: string,
    model?: string
  ): Promise<ToolResult<string>> {
    return this.fetch<string>('/api/llm/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        context: notebookContext,
        history,
        provider,
        model,
      }),
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private parseJupyterOutput(output: any): CellOutput {
    // Handle outputs already in internal format (from WebSocket)
    if (output.type && output.content !== undefined) {
      return {
        type: output.type,
        content: output.content,
      };
    }
    // Handle Jupyter notebook format
    if (output.output_type === 'stream') {
      return {
        type: output.name === 'stderr' ? 'stderr' : 'stdout',
        content: Array.isArray(output.text) ? output.text.join('') : output.text,
      };
    }
    if (output.output_type === 'error') {
      return {
        type: 'error',
        content: (output.traceback || []).join('\n'),
      };
    }
    if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
      if (output.data?.['image/png']) {
        return { type: 'image', content: output.data['image/png'] };
      }
      if (output.data?.['text/html']) {
        return { type: 'html', content: output.data['text/html'] };
      }
      if (output.data?.['text/plain']) {
        return { type: 'stdout', content: output.data['text/plain'] };
      }
    }
    return { type: 'stdout', content: JSON.stringify(output) };
  }

  private toJupyterOutput(output: CellOutput): any {
    switch (output.type) {
      case 'stdout':
        return { output_type: 'stream', name: 'stdout', text: output.content };
      case 'stderr':
        return { output_type: 'stream', name: 'stderr', text: output.content };
      case 'error':
        return { output_type: 'error', traceback: output.content.split('\n') };
      case 'image':
        return { output_type: 'display_data', data: { 'image/png': output.content } };
      case 'html':
        return { output_type: 'display_data', data: { 'text/html': output.content } };
      default:
        return { output_type: 'stream', name: 'stdout', text: output.content };
    }
  }
}

/**
 * Create a new Nebula client
 */
export function createNebulaClient(config?: NebulaClientConfig): NebulaClient {
  return new NebulaClient(config);
}
