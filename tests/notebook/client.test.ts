/**
 * Tests for NebulaClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NebulaClient, createNebulaClient } from '../../src/notebook/client.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('NebulaClient', () => {
  let client: NebulaClient;

  beforeEach(() => {
    client = createNebulaClient({ baseUrl: 'http://localhost:8000' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createNebulaClient', () => {
    it('should create client with default config', () => {
      const defaultClient = createNebulaClient();
      expect(defaultClient).toBeInstanceOf(NebulaClient);
    });

    it('should create client with custom base URL', () => {
      const customClient = createNebulaClient({ baseUrl: 'http://custom:9000' });
      expect(customClient).toBeInstanceOf(NebulaClient);
    });
  });

  describe('listKernels', () => {
    it('should return available kernels', async () => {
      // API returns { kernels: Array<{ name: string }> }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kernels: [{ name: 'python3' }, { name: 'ir' }, { name: 'julia' }],
        }),
      });

      const result = await client.listKernels();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['python3', 'ir', 'julia']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/kernels',
        expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
      );
    });

    it('should handle API errors', async () => {
      // Create a client with no retries for error testing
      const errorClient = createNebulaClient({ baseUrl: 'http://localhost:8000', retries: 1 });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await errorClient.listKernels();

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });
  });

  describe('startKernel', () => {
    it('should start a kernel session', async () => {
      // API returns { session_id, kernel_name } (snake_case)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session_id: 'session-123',
          kernel_name: 'python3',
        }),
      });

      const result = await client.startKernel('python3');

      expect(result.success).toBe(true);
      expect(result.data?.sessionId).toBe('session-123');
      expect(result.data?.kernelName).toBe('python3');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/kernels/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ kernel_name: 'python3' }),
        })
      );
    });

    it('should use default kernel name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'session-456', kernel_name: 'python3' }),
      });

      await client.startKernel();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ kernel_name: 'python3' }),
        })
      );
    });
  });

  describe('executeCode', () => {
    it('should execute code in session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          outputs: [{ type: 'stdout', content: 'Hello World' }],
          executionCount: 1,
          success: true,
        }),
      });

      const result = await client.executeCode('session-123', 'print("Hello World")');

      expect(result.success).toBe(true);
      expect(result.data?.outputs).toHaveLength(1);
      expect(result.data?.outputs[0].content).toBe('Hello World');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/kernels/session-123/execute',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ code: 'print("Hello World")' }),
        })
      );
    });
  });

  describe('interruptKernel', () => {
    it('should interrupt running kernel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await client.interruptKernel('session-123');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/kernels/session-123/interrupt',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('shutdownKernel', () => {
    it('should shutdown kernel session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await client.shutdownKernel('session-123');

      expect(result.success).toBe(true);
      // shutdownKernel uses DELETE method to /api/kernels/{sessionId}
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/kernels/session-123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('readNotebook', () => {
    const mockNotebookContent = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { name: 'python3' } },
      cells: [
        {
          cell_type: 'code',
          source: 'print("hello")',
          metadata: { nebula_id: 'cell-1' },
          outputs: [{ output_type: 'stream', name: 'stdout', text: 'hello\n' }],
          execution_count: 1,
        },
        {
          cell_type: 'markdown',
          source: '# Title',
          metadata: { nebula_id: 'cell-2' },
        },
      ],
    });

    it('should read and parse notebook', async () => {
      // API returns { path, type, content } where content is parsed JSON for notebooks
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          path: '/path/to/notebook.ipynb',
          type: 'notebook',
          content: JSON.parse(mockNotebookContent),
        }),
      });

      const result = await client.readNotebook('/path/to/notebook.ipynb');

      expect(result.success).toBe(true);
      expect(result.data?.cells).toHaveLength(2);
      expect(result.data?.cells[0].type).toBe('code');
      expect(result.data?.cells[0].content).toBe('print("hello")');
      expect(result.data?.cells[0].id).toBe('cell-1');
      expect(result.data?.cells[1].type).toBe('markdown');
    });

    it('should parse different output types', async () => {
      const notebookWithOutputs = {
        nbformat: 4,
        nbformat_minor: 5,
        cells: [
          {
            cell_type: 'code',
            source: 'code',
            metadata: {},
            outputs: [
              { output_type: 'stream', name: 'stdout', text: 'stdout output' },
              { output_type: 'stream', name: 'stderr', text: 'stderr output' },
              { output_type: 'error', traceback: ['Error line 1', 'Error line 2'] },
              { output_type: 'display_data', data: { 'image/png': 'base64data' } },
              { output_type: 'execute_result', data: { 'text/html': '<b>html</b>' } },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          path: '/path/to/notebook.ipynb',
          type: 'notebook',
          content: notebookWithOutputs,
        }),
      });

      const result = await client.readNotebook('/path/to/notebook.ipynb');

      expect(result.success).toBe(true);
      const outputs = result.data?.cells[0].outputs!;
      expect(outputs).toHaveLength(5);
      expect(outputs[0].type).toBe('stdout');
      expect(outputs[1].type).toBe('stderr');
      expect(outputs[2].type).toBe('error');
      expect(outputs[3].type).toBe('image');
      expect(outputs[4].type).toBe('html');
    });

    it('should handle invalid JSON', async () => {
      // For text type, content is a string that gets JSON.parsed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          path: '/path/to/notebook.ipynb',
          type: 'text',
          content: 'not valid json',
        }),
      });

      const result = await client.readNotebook('/path/to/notebook.ipynb');

      expect(result.success).toBe(false);
      expect(result.error).toContain('parse');
    });
  });

  describe('writeNotebook', () => {
    it('should write notebook to file', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await client.writeNotebook({
        path: '/path/to/notebook.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'print("hello")' },
          { id: 'cell-2', type: 'markdown', content: '# Title' },
        ],
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/fs/write',
        expect.objectContaining({ method: 'POST' })
      );

      // Verify the notebook structure
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.path).toBe('/path/to/notebook.ipynb');
      const notebookContent = JSON.parse(body.content);
      expect(notebookContent.nbformat).toBe(4);
      expect(notebookContent.cells).toHaveLength(2);
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      // API returns { path, parent, mtime, items: Array<{name, path, isDirectory, ...}> }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          path: '/path',
          parent: '/',
          mtime: Date.now(),
          items: [
            { name: 'file1.ipynb', path: '/path/file1.ipynb', isDirectory: false, size: '1KB', modified: Date.now(), extension: '.ipynb', fileType: 'notebook' },
            { name: 'folder', path: '/path/folder', isDirectory: true, size: '', modified: Date.now(), extension: '', fileType: '' },
          ],
        }),
      });

      const result = await client.listFiles('/path');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].name).toBe('file1.ipynb');
      expect(result.data![0].type).toBe('notebook');
      expect(result.data![1].name).toBe('folder');
      expect(result.data![1].type).toBe('directory');
    });
  });

  describe('generateCode', () => {
    it('should generate code using LLM', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => 'def hello():\n    print("Hello")',
      });

      const result = await client.generateCode('Create a hello function', 'context');

      expect(result.success).toBe(true);
      expect(result.data).toContain('def hello');
    });
  });

  describe('chat', () => {
    it('should chat with notebook context', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => 'This code defines a function that...',
      });

      const result = await client.chat(
        'What does this code do?',
        'def foo(): pass',
        [{ role: 'user', content: 'Previous message' }]
      );

      expect(result.success).toBe(true);
      expect(result.data).toContain('function');
    });
  });

  describe('timeout handling', () => {
    it('should timeout on slow requests', async () => {
      // Create an AbortError to simulate timeout behavior
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch.mockRejectedValueOnce(abortError);

      const result = await client.listKernels();

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('network errors', () => {
    it('should handle network failures', async () => {
      // Create a client with no retries for error testing
      const errorClient = createNebulaClient({ baseUrl: 'http://localhost:8000', retries: 1 });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await errorClient.listKernels();

      expect(result.success).toBe(false);
      // Error is wrapped as "Request failed: <original message>"
      expect(result.error).toContain('Network error');
    });
  });
});
