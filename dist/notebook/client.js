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
/**
 * Client for Nebula Notebook headless API
 */
export class NebulaClient {
    baseUrl;
    timeout;
    retries;
    agentId;
    clientName;
    clientVersion;
    autoStartAgentSession;
    activeAgentSessions = new Set();
    agentSessionInFlight = new Map();
    lastBackend;
    activeNotebookPath = null;
    // Track last tool call timestamp per notebook path for user change detection
    lastToolCallTimestamp = new Map();
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'http://localhost:8000';
        this.timeout = config.timeout || 30000;
        this.retries = config.retries ?? 3;
        this.agentId = config.agentId;
        this.clientName = config.clientName;
        this.clientVersion = config.clientVersion;
        this.autoStartAgentSession = config.autoStartAgentSession ?? Boolean(config.agentId);
    }
    recordBackend(backend) {
        if (backend) {
            this.lastBackend = backend;
        }
    }
    consumeLastBackend() {
        const backend = this.lastBackend;
        this.lastBackend = undefined;
        return backend;
    }
    /**
     * Get the notebook path associated with the active agent session (if any).
     */
    getActiveNotebookPath() {
        return this.activeNotebookPath;
    }
    setActiveNotebookPath(path) {
        this.activeNotebookPath = path;
    }
    clearActiveNotebookPath(path) {
        if (this.activeNotebookPath === path) {
            const remaining = Array.from(this.activeAgentSessions);
            this.activeNotebookPath = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
    }
    /**
     * Check if an error is retryable (network/connection errors)
     */
    isRetryable(error) {
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            return (msg.includes('network') ||
                msg.includes('connection') ||
                msg.includes('econnrefused') ||
                msg.includes('econnreset') ||
                msg.includes('timeout'));
        }
        return false;
    }
    /**
     * Check if an error is a connection failure (server not reachable)
     */
    isConnectionError(error) {
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            return (msg.includes('econnrefused') ||
                msg.includes('fetch failed') ||
                msg.includes('network request failed') ||
                msg.includes('failed to fetch') ||
                msg.includes('unable to connect') ||
                msg.includes('enotfound') ||
                msg.includes('getaddrinfo'));
        }
        return false;
    }
    /**
     * Delay for retry backoff
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Fetch with automatic retry for transient errors
     */
    async fetch(path, options = {}) {
        let lastError = 'Unknown error';
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
                return { success: true, data: data };
            }
            catch (e) {
                clearTimeout(timeoutId);
                if (e instanceof Error && e.name === 'AbortError') {
                    lastError = 'Request timeout';
                }
                else if (this.isConnectionError(e)) {
                    // Provide helpful error for connection failures
                    lastError = `Cannot connect to Nebula server at ${this.baseUrl}. ` +
                        `Ensure the server is running or use connect_server to configure the correct URL.`;
                }
                else {
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
     * List available kernel specs with display names and versions
     */
    async listKernels() {
        const result = await this.fetch('/api/kernels');
        if (!result.success)
            return { success: false, error: result.error };
        return {
            success: true,
            data: result.data?.kernels.map((k) => ({
                name: k.name,
                displayName: k.display_name,
                language: k.language,
            })) ?? [],
        };
    }
    /**
     * List active kernel sessions
     */
    async listSessions() {
        const result = await this.fetch('/api/kernels/sessions');
        if (!result.success)
            return { success: false, error: result.error };
        return { success: true, data: result.data?.sessions ?? [] };
    }
    /**
     * Start a new kernel session
     */
    async startKernel(kernelName = 'python3', filePath) {
        const result = await this.fetch('/api/kernels/start', {
            method: 'POST',
            body: JSON.stringify({ kernel_name: kernelName, file_path: filePath }),
        });
        if (!result.success)
            return { success: false, error: result.error };
        return {
            success: true,
            data: {
                sessionId: result.data.session_id,
                kernelName: result.data.kernel_name,
                status: 'idle',
                filePath,
            },
        };
    }
    /**
     * Get or create a kernel session for a notebook file
     */
    async getOrCreateKernelForFile(filePath, kernelName) {
        const result = await this.fetch('/api/kernels/for-file', {
            method: 'POST',
            body: JSON.stringify({ file_path: filePath, kernel_name: kernelName }),
        });
        if (!result.success)
            return { success: false, error: result.error };
        return {
            success: true,
            data: {
                sessionId: result.data.session_id,
                kernelName: result.data.kernel_name,
                status: 'idle',
                filePath: result.data.file_path,
            },
        };
    }
    /**
     * Execute code in a kernel session (simple REST version)
     */
    async executeCode(sessionId, code) {
        return this.fetch(`/api/kernels/${sessionId}/execute`, {
            method: 'POST',
            body: JSON.stringify({ code }),
        });
    }
    /**
     * Execute code with WebSocket streaming for real-time output
     */
    async executeCodeStreaming(sessionId, code, timeoutMs = 60000) {
        return new Promise((resolve) => {
            const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/api/kernels/${sessionId}/ws`;
            const outputs = [];
            let executionCount;
            let hasError = false;
            let errorMessage;
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
                    ws.onmessage = (event) => {
                        try {
                            const data = typeof event.data === 'string' ? event.data : event.data.toString();
                            const msg = JSON.parse(data);
                            if (msg.type === 'output') {
                                outputs.push(this.parseJupyterOutput(msg.output));
                            }
                            else if (msg.type === 'result') {
                                executionCount = msg.result?.execution_count;
                                if (msg.result?.outputs) {
                                    outputs.push(...msg.result.outputs.map((o) => this.parseJupyterOutput(o)));
                                }
                            }
                            else if (msg.type === 'error') {
                                hasError = true;
                                errorMessage = msg.error;
                                outputs.push({ type: 'error', content: msg.error || 'Unknown error' });
                            }
                            else if (msg.type === 'status' && msg.status === 'idle') {
                                clearTimeout(timeout);
                                ws.close();
                                resolve({
                                    success: !hasError,
                                    data: { outputs, success: !hasError, executionCount, error: errorMessage },
                                });
                            }
                        }
                        catch (e) {
                            // Ignore parse errors for non-JSON messages
                        }
                    };
                    ws.onerror = (error) => {
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
                }
                catch (e) {
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
    async interruptKernel(sessionId) {
        return this.fetch(`/api/kernels/${sessionId}/interrupt`, {
            method: 'POST',
        });
    }
    /**
     * Restart a kernel session
     */
    async restartKernel(sessionId) {
        return this.fetch(`/api/kernels/${sessionId}/restart`, {
            method: 'POST',
        });
    }
    /**
     * Shutdown a kernel session
     */
    async shutdownKernel(sessionId) {
        return this.fetch(`/api/kernels/${sessionId}`, {
            method: 'DELETE',
        });
    }
    /**
     * Stop a kernel session (alias for shutdownKernel)
     */
    async stopKernel(sessionId) {
        return this.shutdownKernel(sessionId);
    }
    // ===========================================================================
    // File Operations (non-notebook specific)
    // ===========================================================================
    /**
     * List files in a directory
     */
    async listFiles(path = '.') {
        const result = await this.fetch(`/api/fs/list?path=${encodeURIComponent(path)}`);
        if (!result.success)
            return { success: false, error: result.error };
        // Transform the response to match expected format
        const items = result.data.items.map((item) => ({
            name: item.name,
            type: item.isDirectory ? 'directory' : item.fileType || 'file',
        }));
        return { success: true, data: items };
    }
    /**
     * Read a file's content
     */
    async readFile(path) {
        const result = await this.fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
        if (!result.success)
            return { success: false, error: result.error };
        // Handle binary files
        if (result.data.type === 'binary') {
            return { success: false, error: result.data.message || 'Binary file cannot be read as text' };
        }
        // Handle notebook files (return as JSON string)
        if (result.data.type === 'notebook') {
            return { success: true, data: { content: JSON.stringify(result.data.content, null, 2) } };
        }
        // Handle text files
        return { success: true, data: { content: result.data.content } };
    }
    /**
     * Write content to a file
     */
    async writeFile(path, content) {
        return this.fetch('/api/fs/write', {
            method: 'POST',
            body: JSON.stringify({ path, content, file_type: 'text' }),
        });
    }
    /**
     * Delete a file or directory
     */
    async deleteFile(path) {
        return this.fetch(`/api/fs/delete?path=${encodeURIComponent(path)}`, {
            method: 'DELETE',
        });
    }
    /**
     * Rename/move a file or directory
     */
    async renameFile(oldPath, newPath) {
        return this.fetch('/api/fs/rename', {
            method: 'POST',
            body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
        });
    }
    /**
     * Download a file as Buffer (supports both text and binary)
     * Uses the /fs/download endpoint that streams raw file content
     */
    async downloadFile(serverPath) {
        try {
            const url = `${this.baseUrl}/api/fs/download?path=${encodeURIComponent(serverPath)}`;
            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text();
                let errorDetail = 'Download failed';
                try {
                    const errorJson = JSON.parse(errorText);
                    errorDetail = errorJson.detail || errorDetail;
                }
                catch {
                    errorDetail = errorText || errorDetail;
                }
                return { success: false, error: errorDetail };
            }
            const arrayBuffer = await response.arrayBuffer();
            const content = Buffer.from(arrayBuffer);
            return { success: true, data: { content } };
        }
        catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { success: false, error: `Download failed: ${error}` };
        }
    }
    /**
     * Upload a file using multipart form data (supports binary)
     */
    async uploadFile(destDir, content, filename) {
        try {
            const blob = new Blob([content]);
            const formData = new FormData();
            formData.append('file', blob, filename);
            formData.append('path', destDir);
            const url = `${this.baseUrl}/api/fs/upload`;
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                const errorText = await response.text();
                let errorDetail = 'Upload failed';
                try {
                    const errorJson = JSON.parse(errorText);
                    errorDetail = errorJson.detail || errorDetail;
                }
                catch {
                    errorDetail = errorText || errorDetail;
                }
                return { success: false, error: errorDetail };
            }
            return { success: true };
        }
        catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { success: false, error: `Upload failed: ${error}` };
        }
    }
    /**
     * Get the metadata schema from Nebula API
     */
    async getMetadataSchema() {
        return this.fetch('/api/cell/metadata-schema');
    }
    // ===========================================================================
    // Execution
    // ===========================================================================
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
    async executeCell(path, sessionId, options = {}) {
        const { cellIndex, cellId, timeout = 60000, save = true, saveIntervalMs = 2000 } = options;
        if (cellIndex === undefined && cellId === undefined) {
            return { success: false, error: 'Must provide either cellIndex or cellId' };
        }
        // Read the notebook via router (gets UI state if connected, else file)
        const notebookResult = await this.readNotebookViaRouter(path);
        if (!notebookResult.success) {
            return { success: false, error: notebookResult.error };
        }
        const notebook = notebookResult.data;
        let foundIndex = -1;
        let cell;
        if (cellId !== undefined) {
            foundIndex = notebook.cells.findIndex(c => c.id === cellId);
            if (foundIndex === -1) {
                return { success: false, error: `Cell with id '${cellId}' not found` };
            }
            cell = notebook.cells[foundIndex];
        }
        else {
            if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
                return { success: false, error: `Cell index ${cellIndex} out of range (0-${notebook.cells.length - 1})` };
            }
            foundIndex = cellIndex;
            cell = notebook.cells[foundIndex];
        }
        if (cell.type !== 'code') {
            return { success: false, error: `Cell ${foundIndex} is not a code cell (type: ${cell.type})` };
        }
        // Execute with incremental saves via operation router
        const result = await this.executeWithIncrementalSave(sessionId, cell.content, path, cell.id, { timeout, save, saveIntervalMs });
        return {
            success: result.success,
            data: result.data ? {
                ...result.data,
                cellIndex: foundIndex,
                cellId: cell.id,
            } : undefined,
            error: result.error,
        };
    }
    /**
     * Execute code with incremental saves via operation router
     * Outputs are sent to UI (if connected) or saved to file via updateOutputs operation
     */
    async executeWithIncrementalSave(sessionId, code, path, cellId, options) {
        const { timeout, save, saveIntervalMs } = options;
        return new Promise((resolve) => {
            const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/api/kernels/${sessionId}/ws`;
            const outputs = [];
            let executionCount;
            let hasError = false;
            let errorMessage;
            let lastSaveTime = Date.now();
            let saveTimer;
            const saveOutputs = async () => {
                if (!save)
                    return;
                // Use operation router to update outputs (goes to UI if connected)
                await this.updateOutputsOp(path, cellId, [...outputs], executionCount);
                lastSaveTime = Date.now();
            };
            const connectWs = async () => {
                try {
                    const WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : (await import('ws')).default;
                    const ws = new WebSocketImpl(wsUrl);
                    const timeoutTimer = setTimeout(async () => {
                        if (saveTimer)
                            clearInterval(saveTimer);
                        await saveOutputs(); // Final save before closing
                        ws.close();
                        resolve({
                            success: true, // Timeout is not an error, just incomplete
                            data: { outputs, success: true, executionCount },
                        });
                    }, timeout);
                    // Set up periodic save interval
                    if (save) {
                        saveTimer = setInterval(async () => {
                            if (outputs.length > 0 && Date.now() - lastSaveTime >= saveIntervalMs) {
                                await saveOutputs();
                            }
                        }, saveIntervalMs);
                    }
                    ws.onopen = () => {
                        ws.send(JSON.stringify({ type: 'execute', code }));
                    };
                    ws.onmessage = (event) => {
                        try {
                            const data = typeof event.data === 'string' ? event.data : event.data.toString();
                            const msg = JSON.parse(data);
                            if (msg.type === 'output') {
                                outputs.push(this.parseJupyterOutput(msg.output));
                            }
                            else if (msg.type === 'result') {
                                executionCount = msg.result?.execution_count;
                                if (msg.result?.outputs) {
                                    outputs.push(...msg.result.outputs.map((o) => this.parseJupyterOutput(o)));
                                }
                            }
                            else if (msg.type === 'error') {
                                hasError = true;
                                errorMessage = msg.error;
                                outputs.push({ type: 'error', content: msg.error || 'Unknown error' });
                            }
                            else if (msg.type === 'status' && msg.status === 'idle') {
                                clearTimeout(timeoutTimer);
                                if (saveTimer)
                                    clearInterval(saveTimer);
                                // Final save
                                (async () => {
                                    await saveOutputs();
                                    ws.close();
                                    resolve({
                                        success: !hasError,
                                        data: { outputs, success: !hasError, executionCount, error: errorMessage },
                                    });
                                })();
                            }
                        }
                        catch (e) {
                            // Ignore parse errors for non-JSON messages
                        }
                    };
                    ws.onerror = async (error) => {
                        clearTimeout(timeoutTimer);
                        if (saveTimer)
                            clearInterval(saveTimer);
                        await saveOutputs(); // Save what we have
                        ws.close();
                        resolve({
                            success: false,
                            error: `WebSocket error: ${error.message || 'Unknown error'}`,
                        });
                    };
                    ws.onclose = () => {
                        clearTimeout(timeoutTimer);
                        if (saveTimer)
                            clearInterval(saveTimer);
                    };
                }
                catch (e) {
                    // Fall back to non-incremental execution
                    const result = await this.executeCodeStreaming(sessionId, code, timeout);
                    if (result.success && save) {
                        await this.updateOutputsOp(path, cellId, result.data.outputs, result.data.executionCount);
                    }
                    resolve(result);
                }
            };
            connectWs();
        });
    }
    /**
     * Search cells in a notebook by keyword
     */
    async searchCells(path, query, limit = 5) {
        const notebookResult = await this.readNotebookViaRouter(path);
        if (!notebookResult.success) {
            return { success: false, error: notebookResult.error };
        }
        const notebook = notebookResult.data;
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
    async generateCode(prompt, context, provider, model) {
        return this.fetch('/api/llm/generate', {
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
    async chat(message, notebookContext, history, provider, model) {
        return this.fetch('/api/llm/chat', {
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
    parseJupyterOutput(output) {
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
    toJupyterOutput(output) {
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
    // ===========================================================================
    // Operation-Based API (routes through backend to UI or headless)
    // ===========================================================================
    //
    // These methods use the Operation Router pattern:
    // 1. Client sends operation to POST /api/notebook/operation
    // 2. Backend checks if UI is connected via WebSocket
    // 3. If UI connected: forwards to UI, UI applies and returns result
    // 4. If no UI: applies via HeadlessOperationHandler (file-based)
    //
    // From the agent's perspective, both paths are identical.
    // ===========================================================================
    /**
     * Apply a notebook operation through the operation router.
     *
     * Operations are routed to:
     * - Connected UI via WebSocket (if available) - UI applies and saves
     * - Headless manager (file-based) otherwise
     *
     * From the agent's perspective, both modes behave identically.
     */
    async applyOperation(operation) {
        if (this.agentId) {
            operation.agentId = this.agentId;
            if (this.clientName) {
                operation.clientName = this.clientName;
            }
            if (this.clientVersion) {
                operation.clientVersion = this.clientVersion;
            }
            if (this.autoStartAgentSession && this.isWriteOperation(operation.type)) {
                const ensured = await this.ensureAgentSession(operation.notebookPath);
                if (!ensured.success) {
                    return { success: false, error: ensured.error };
                }
            }
        }
        const result = await this.fetch('/api/notebook/operation', {
            method: 'POST',
            body: JSON.stringify({ operation }),
        });
        if (result.success) {
            this.recordBackend(result.data?.backend);
        }
        return result;
    }
    isWriteOperation(opType) {
        const readOnlyOps = new Set(['readCell', 'readCellOutput', 'searchCells', 'readNotebook']);
        const sessionOps = new Set(['startAgentSession', 'endAgentSession']);
        const creationOps = new Set(['createNotebook']); // File doesn't exist yet, no session needed
        return !readOnlyOps.has(opType) && !sessionOps.has(opType) && !creationOps.has(opType);
    }
    async ensureAgentSession(path) {
        if (!this.agentId) {
            return { success: true, data: {} };
        }
        if (this.activeAgentSessions.has(path)) {
            return { success: true, data: {} };
        }
        const inFlight = this.agentSessionInFlight.get(path);
        if (inFlight) {
            return inFlight;
        }
        const startPromise = this.startAgentSession(path, this.agentId);
        this.agentSessionInFlight.set(path, startPromise);
        try {
            const result = await startPromise;
            return result;
        }
        finally {
            this.agentSessionInFlight.delete(path);
        }
    }
    /**
     * Read notebook through the operation router.
     *
     * If UI is connected, requests current state from UI.
     * Otherwise reads from file.
     */
    async readNotebookViaRouter(path, options = {}) {
        // Build query string with options
        const params = new URLSearchParams({ path });
        if (options.includeOutputs !== undefined) {
            params.set('include_outputs', String(options.includeOutputs));
        }
        if (options.maxLines !== undefined) {
            params.set('max_lines', String(options.maxLines));
        }
        if (options.maxChars !== undefined) {
            params.set('max_chars', String(options.maxChars));
        }
        if (options.maxLinesError !== undefined) {
            params.set('max_lines_error', String(options.maxLinesError));
        }
        if (options.maxCharsError !== undefined) {
            params.set('max_chars_error', String(options.maxCharsError));
        }
        const result = await this.fetch(`/api/notebook/read?${params.toString()}`);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        // Router returns response with success/data/error structure
        const routerResult = result.data;
        this.recordBackend(routerResult.backend);
        if (!routerResult.success) {
            return { success: false, error: routerResult.error };
        }
        return {
            success: true,
            data: {
                path: routerResult.data.path,
                cells: routerResult.data.cells,
                metadata: routerResult.data.metadata,
                backend: routerResult.backend,
            },
        };
    }
    /**
     * Check if a UI is connected for a notebook path
     */
    async hasUI(path) {
        const result = await this.fetch(`/api/notebook/has-ui?path=${encodeURIComponent(path)}`);
        return result.success && result.data?.hasUI === true;
    }
    // ===========================================================================
    // Operation-Based Notebook Methods
    // ===========================================================================
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
    async createNotebookOp(path, options = {}) {
        const { overwrite = false, kernelName = 'python3', kernelDisplayName = 'Python 3' } = options;
        return this.applyOperation({
            type: 'createNotebook',
            notebookPath: path,
            overwrite,
            kernelName,
            kernelDisplayName,
        });
    }
    // ===========================================================================
    // Operation-Based Cell Methods
    // ===========================================================================
    /**
     * Insert a cell using the operation router
     */
    async insertCellOp(path, index, cell) {
        const operation = {
            type: 'insertCell',
            notebookPath: path,
            index,
            cell,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                cellIndex: opResult.cellIndex,
                cellId: opResult.cellId,
                totalCells: -1, // Not available from operation result
                idModified: opResult.idModified,
                requestedId: opResult.requestedId,
            },
        };
    }
    /**
     * Delete a cell using the operation router
     */
    async deleteCellOp(path, options) {
        const operation = {
            type: 'deleteCell',
            notebookPath: path,
            cellId: options.cellId,
            cellIndex: options.cellIndex,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return { success: true };
    }
    /**
     * Update cell content using the operation router
     */
    async updateContentOp(path, cellId, content) {
        const operation = {
            type: 'updateContent',
            notebookPath: path,
            cellId,
            content,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return { success: true };
    }
    /**
     * Update cell metadata using the operation router
     */
    async updateMetadataOp(path, cellId, changes) {
        const operation = {
            type: 'updateMetadata',
            notebookPath: path,
            cellId,
            changes,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return { success: true };
    }
    /**
     * Move a cell using the operation router
     *
     * Supports two modes:
     * 1. By index: moveCellOp(path, 0, 5) - move from index 0 to 5
     * 2. By ID: moveCellOp(path, 0, 0, { cellId: 'cell-1', afterCellId: 'cell-2' })
     */
    async moveCellOp(path, fromIndex, toIndex, options) {
        const operation = {
            type: 'moveCell',
            notebookPath: path,
            fromIndex,
            toIndex,
            ...(options?.cellId && { cellId: options.cellId }),
            ...(options?.afterCellId && { afterCellId: options.afterCellId }),
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                cellId: opResult.cellId,
                fromIndex: opResult.fromIndex ?? fromIndex,
                toIndex: opResult.toIndex ?? toIndex,
            },
        };
    }
    /**
     * Duplicate a cell using the operation router
     */
    async duplicateCellOp(path, cellIndex, newCellId) {
        const operation = {
            type: 'duplicateCell',
            notebookPath: path,
            cellIndex,
            newCellId,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                cellIndex: opResult.cellIndex,
                cellId: opResult.cellId,
                metadata: opResult.metadata // Phase 2 ready: include metadata from backend
            },
        };
    }
    /**
     * Update cell outputs using the operation router
     */
    async updateOutputsOp(path, cellId, outputs, executionCount) {
        const operation = {
            type: 'updateOutputs',
            notebookPath: path,
            cellId,
            outputs,
            executionCount,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return { success: true };
    }
    // ===========================================================================
    // Read Operations (single cell, no full notebook read needed)
    // ===========================================================================
    /**
     * Read a single cell using the operation router.
     *
     * More efficient than readNotebook when you only need one cell.
     * Routes to UI if connected, otherwise reads from file.
     */
    async readCellOp(path, options) {
        const operation = {
            type: 'readCell',
            notebookPath: path,
            cellId: options.cellId,
            cellIndex: options.cellIndex,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                cell: opResult.cell,
                cellIndex: opResult.cellIndex,
            },
        };
    }
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
    async readCellOutputOp(path, options) {
        const operation = {
            type: 'readCellOutput',
            notebookPath: path,
            cellId: options.cellId,
            cellIndex: options.cellIndex,
            // Pass truncation options using snake_case for backend
            max_lines: options.maxLines,
            max_chars: options.maxChars,
            max_lines_error: options.maxLinesError,
            max_chars_error: options.maxCharsError,
            line_offset: options.lineOffset,
            save_to_file: options.saveToFile,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                outputs: opResult.outputs || [],
                executionCount: opResult.executionCount,
                executionStatus: opResult.executionStatus,
                cellId: opResult.cellId,
                cellIndex: opResult.cellIndex,
                temp_files: opResult.temp_files,
            },
        };
    }
    /**
     * Clear all cells from a notebook using the operation router
     *
     * This is the proper way to clear a notebook - routes to UI if connected
     * or falls back to headless mode. Returns the number of cells deleted.
     */
    async clearNotebookOp(path) {
        const operation = {
            type: 'clearNotebook',
            notebookPath: path,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                deletedCount: opResult.deletedCount ?? 0,
                metadata: opResult.metadata // Phase 2 ready: include metadata from backend
            },
        };
    }
    // ===========================================================================
    // Batch Operations (Phase 1 enhancements)
    // ===========================================================================
    /**
     * Delete multiple cells by ID in a single operation
     *
     * More efficient than multiple single deletes - handles index shifting automatically.
     */
    async deleteCellsOp(path, cellIds) {
        const operation = {
            type: 'deleteCells',
            notebookPath: path,
            cellIds,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                deletedCount: opResult.deletedCount ?? 0,
                deletedIds: opResult.deletedIds ?? [],
                notFound: opResult.notFound,
                totalCells: opResult.totalCells ?? 0,
            },
        };
    }
    /**
     * Insert multiple cells at a position in a single operation
     *
     * More efficient than multiple single inserts.
     */
    async insertCellsOp(path, cells, position = -1) {
        const operation = {
            type: 'insertCells',
            notebookPath: path,
            cells,
            position,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                insertedCount: opResult.insertedCount ?? 0,
                insertedIds: opResult.insertedIds ?? [],
                startIndex: opResult.startIndex ?? 0,
                totalCells: opResult.totalCells ?? 0,
            },
        };
    }
    /**
     * Search cells with optional output search
     *
     * Enhanced version that can search in cell outputs as well as source code.
     */
    async searchCellsOp(path, query, options = {}) {
        const operation = {
            type: 'searchCells',
            notebookPath: path,
            query,
            includeOutputs: options.includeOutputs ?? false,
            limit: options.limit ?? 10,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                query: opResult.query ?? query,
                matchCount: opResult.matchCount ?? 0,
                matches: opResult.matches ?? [],
                hasMore: opResult.hasMore ?? false,
            },
        };
    }
    /**
     * Clear outputs from one or more cells
     *
     * Useful for cleanup before sharing notebooks.
     */
    async clearOutputsOp(path, cellIds) {
        const operation = {
            type: 'clearOutputs',
            notebookPath: path,
            ...(cellIds && cellIds.length > 0 ? { cellIds } : {}),
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                clearedCount: opResult.clearedCount ?? 0,
                clearedIds: opResult.clearedIds ?? [],
                notFound: opResult.notFound,
            },
        };
    }
    // ===========================================================================
    // Execution Operations
    // ===========================================================================
    /**
     * Execute a cell through the operation router
     *
     * Routes to UI if connected (shows running indicator) or executes in headless mode.
     * For long-running cells, returns with status="busy" after maxWait seconds.
     * Use readCellOutputOp with max_wait to poll for more output.
     */
    async executeCellOp(path, options) {
        const operation = {
            type: 'executeCell',
            notebookPath: path,
            cellId: options.cellId,
            cellIndex: options.cellIndex,
            sessionId: options.sessionId,
            maxWait: options.maxWait,
            saveOutputs: options.saveOutputs,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        return {
            success: true,
            data: {
                cellId: opResult.cellId,
                cellIndex: opResult.cellIndex,
                executionStatus: opResult.executionStatus ?? 'idle',
                executionCount: opResult.executionCount,
                outputs: opResult.outputs ?? [],
                executionTime: opResult.executionTime,
                sessionId: opResult.sessionId,
                error: opResult.error,
            },
        };
    }
    // ===========================================================================
    // Agent Session Management
    // ===========================================================================
    //
    // Agent sessions provide:
    // 1. UI feedback: Shows "Agent" badge with purple styling when session active
    // 2. Conflict prevention: Warns if multiple agents try to access same notebook
    // 3. Session tracking: Records start time and agent ID for diagnostics
    //
    // Best practice: Always wrap agent operations in try/finally:
    //
    //   await client.startAgentSession(path, 'my-agent');
    //   try {
    //     // ... operations ...
    //   } finally {
    //     await client.endAgentSession(path);
    //   }
    //
    // In headless mode (no UI), session operations are no-ops that always succeed.
    // ===========================================================================
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
    async startAgentSession(path, agentId, force, lastSessionTimestamp) {
        const operation = {
            type: 'startAgentSession',
            notebookPath: path,
            agentId: agentId || this.agentId,
            clientName: this.clientName,
            clientVersion: this.clientVersion,
            force,
            lastSessionTimestamp,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        this.activeAgentSessions.add(path);
        this.setActiveNotebookPath(path);
        return {
            success: true,
            data: {
                warning: opResult.warning,
                updatesSince: opResult.updatesSince,
            },
        };
    }
    /**
     * End an agent session (unlocks notebook).
     * Should be called when agent work is complete.
     */
    async endAgentSession(path) {
        const operation = {
            type: 'endAgentSession',
            notebookPath: path,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        this.activeAgentSessions.delete(path);
        this.clearActiveNotebookPath(path);
        return {
            success: true,
            data: {
                sessionDuration: opResult.sessionDuration,
                warning: opResult.warning,
            },
        };
    }
    // ===========================================================================
    // Python Environment Discovery
    // ===========================================================================
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
    async listPythonEnvironments(refresh = false) {
        const result = await this.fetch(`/api/python/environments?refresh=${refresh}`);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return {
            success: true,
            data: result.data.environments.map(env => ({
                name: env.name,
                path: env.path,
                version: env.version,
                source: env.source,
                isActive: env.is_active,
            })),
        };
    }
    /**
     * Get detailed information about a Python environment.
     *
     * @param pythonPath - Path to the Python executable (optional, uses system Python if not provided)
     */
    async getPythonInfo(pythonPath) {
        try {
            // If no path provided, get info about the first available Python
            if (!pythonPath) {
                const envResult = await this.listPythonEnvironments();
                if (!envResult.success || !envResult.data?.length) {
                    return { success: false, error: 'No Python environments found' };
                }
                pythonPath = envResult.data[0].path;
            }
            // For now, return basic info from the environment list
            // A more detailed endpoint could be added to the backend
            const envResult = await this.listPythonEnvironments();
            if (!envResult.success) {
                return { success: false, error: envResult.error };
            }
            const env = envResult.data?.find(e => e.path === pythonPath);
            if (!env) {
                return { success: false, error: `Python not found: ${pythonPath}` };
            }
            return {
                success: true,
                data: {
                    path: env.path,
                    version: env.version || 'unknown',
                },
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }
    // ===========================================================================
    // User Change Tracking
    // ===========================================================================
    /**
     * Get the last tool call timestamp for a notebook path.
     * Used internally to track user changes between tool calls.
     */
    getLastToolCallTimestamp(path) {
        return this.lastToolCallTimestamp.get(path) ?? 0;
    }
    /**
     * Record the current time as the last tool call for a notebook path.
     * Called automatically after each operation.
     */
    recordToolCallTimestamp(path, timestamp) {
        this.lastToolCallTimestamp.set(path, timestamp ?? Date.now());
    }
    /**
     * Get updates since the last tool call for a notebook.
     *
     * Returns summaries of edits and events since the last recorded
     * tool call timestamp (no source filtering).
     */
    async getUpdatesSinceOp(path) {
        const sinceTimestamp = this.getLastToolCallTimestamp(path);
        const operation = {
            type: 'getUpdatesSince',
            notebookPath: path,
            sinceTimestamp,
        };
        const result = await this.applyOperation(operation);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const opResult = result.data;
        if (!opResult.success) {
            return { success: false, error: opResult.error };
        }
        // Update the timestamp with server's timestamp if provided
        if (opResult.serverTimestamp) {
            this.recordToolCallTimestamp(path, opResult.serverTimestamp);
        }
        return {
            success: true,
            data: {
                updates: opResult.updatesSince ?? [],
                sinceTimestamp,
                serverTimestamp: opResult.serverTimestamp ?? Date.now(),
            },
        };
    }
}
/**
 * Create a new Nebula client
 */
export function createNebulaClient(config) {
    return new NebulaClient(config);
}
//# sourceMappingURL=client.js.map