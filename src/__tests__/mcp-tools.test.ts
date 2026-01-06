/**
 * Tests for MCP Tool Handlers
 *
 * Tests the tool handler functions directly with a live server.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NebulaClient } from '../notebook/client.js';
import { handleKernelTool } from '../mcp/tools/kernel.js';
import { handleNotebookTool } from '../mcp/tools/notebook.js';
import { handleExecutionTool } from '../mcp/tools/execution.js';
import { handleFileTool } from '../mcp/tools/files.js';

const TEST_NOTEBOOK_PATH = '/tmp/mcp-test-notebook.ipynb';

describe('MCP Tool Handlers', () => {
  let client: NebulaClient;

  beforeAll(async () => {
    client = new NebulaClient({ baseUrl: 'http://localhost:8000' });

    // Create test notebook
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { language_info: { name: 'python' } },
      cells: [
        {
          cell_type: 'markdown',
          source: '# MCP Test Notebook\n\nTesting MCP tools.',
          metadata: {},
        },
        {
          cell_type: 'code',
          source: 'import numpy as np\nprint("Cell 1")',
          metadata: {},
          outputs: [],
          execution_count: null,
        },
        {
          cell_type: 'code',
          source: 'x = 100\nprint(x)',
          metadata: {},
          outputs: [{ output_type: 'stream', name: 'stdout', text: '100\n' }],
          execution_count: 1,
        },
      ],
    };

    await client.writeFile(TEST_NOTEBOOK_PATH, JSON.stringify(notebook, null, 2));
  });

  // ===========================================================================
  // Kernel Tool Handler Tests
  // ===========================================================================
  describe('Kernel Tool Handlers', () => {
    let sessionId: string;

    it('should handle list_kernels', async () => {
      const result = await handleKernelTool('list_kernels', {}, client);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Available kernels');
    });

    it('should handle list_sessions', async () => {
      const result = await handleKernelTool('list_sessions', {}, client);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].type).toBe('text');
    });

    it('should handle kernel_start', async () => {
      const result = await handleKernelTool('kernel_start', { kernel_name: 'python3' }, client);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Kernel started');

      // Extract session ID for later tests
      const match = result.content[0].text.match(/Kernel started: ([^\s]+)/);
      if (match) {
        sessionId = match[1];
      }
    }, 30000); // Kernel startup can take longer than default 5s

    it('should handle kernel_restart', async () => {
      if (!sessionId) return;

      const result = await handleKernelTool('kernel_restart', { session_id: sessionId }, client);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('restarted');
    });

    it('should handle kernel_interrupt', async () => {
      if (!sessionId) return;

      const result = await handleKernelTool('kernel_interrupt', { session_id: sessionId }, client);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('interrupted');
    });

    it('should handle kernel_stop', async () => {
      if (!sessionId) return;

      const result = await handleKernelTool('kernel_stop', { session_id: sessionId }, client);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('stopped');
    });

    it('should handle unknown kernel tool', async () => {
      const result = await handleKernelTool('unknown_tool', {}, client);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown kernel tool');
    });
  });

  // ===========================================================================
  // Notebook Tool Handler Tests
  // ===========================================================================
  describe('Notebook Tool Handlers', () => {
    it('should handle read_notebook with brief format', async () => {
      const result = await handleNotebookTool('read_notebook', {
        path: TEST_NOTEBOOK_PATH,
        format: 'brief',
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Notebook:');
      expect(result.content[0].text).toContain('3 cells');
    });

    it('should handle read_notebook with detailed format', async () => {
      const result = await handleNotebookTool('read_notebook', {
        path: TEST_NOTEBOOK_PATH,
        format: 'detailed',
        include_outputs: true,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Cell 0');
      expect(result.content[0].text).toContain('[md]');
      expect(result.content[0].text).toContain('[code]');
    });

    it('should handle read_cell', async () => {
      const result = await handleNotebookTool('read_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 1,
        include_outputs: true,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Cell 1');
      expect(result.content[0].text).toContain('numpy');
    });

    it('should handle read_cell with outputs', async () => {
      const result = await handleNotebookTool('read_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 2,
        include_outputs: true,
      }, client);

      expect(result.isError).toBeFalsy();
      // Should contain output
      const hasOutput = result.content.some(c =>
        c.type === 'text' && c.text.includes('100')
      );
      expect(hasOutput).toBe(true);
    });

    it('should handle notebook_write_cell (append)', async () => {
      const result = await handleNotebookTool('notebook_write_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: -1,
        cell_id: 'test-appended-cell',
        content: 'print("Appended cell")',
        cell_type: 'code',
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('created');
      expect(result.content[0].text).toContain('test-appended-cell');
    });

    it('should handle notebook_write_cell (update)', async () => {
      const result = await handleNotebookTool('notebook_write_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 1,
        content: 'print("Updated cell")',
        cell_type: 'code',
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('updated');
    });

    it('should handle search_cells', async () => {
      const result = await handleNotebookTool('search_cells', {
        path: TEST_NOTEBOOK_PATH,
        query: 'print',
        limit: 5,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Found');
    });

    it('should handle search_cells with no results', async () => {
      const result = await handleNotebookTool('search_cells', {
        path: TEST_NOTEBOOK_PATH,
        query: 'xyznonexistent123',
        limit: 5,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('No cells matching');
    });

    it('should handle notebook_delete_cell', async () => {
      // First get current cell count
      const readResult = await handleNotebookTool('read_notebook', {
        path: TEST_NOTEBOOK_PATH,
        format: 'brief',
      }, client);

      const result = await handleNotebookTool('notebook_delete_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 3, // Delete the appended cell
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('deleted');
    });

    it('should handle read_cell with invalid index', async () => {
      const result = await handleNotebookTool('read_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 999,
      }, client);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('out of range');
    });

    it('should handle read_notebook with non-existent file', async () => {
      const result = await handleNotebookTool('read_notebook', {
        path: '/tmp/nonexistent-12345.ipynb',
      }, client);

      expect(result.isError).toBe(true);
    });

    it('should handle unknown notebook tool', async () => {
      const result = await handleNotebookTool('unknown_tool', {}, client);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown notebook tool');
    });

    it('should handle notebook_move_cell', async () => {
      // Create a test notebook for move operations
      const moveTestPath = '/tmp/mcp-move-test.ipynb';
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          { cell_type: 'code', source: 'first', metadata: {}, outputs: [] },
          { cell_type: 'code', source: 'second', metadata: {}, outputs: [] },
          { cell_type: 'code', source: 'third', metadata: {}, outputs: [] },
        ],
      };
      await client.writeFile(moveTestPath, JSON.stringify(notebook, null, 2));

      // Move cell 0 to position 2
      const result = await handleNotebookTool('notebook_move_cell', {
        path: moveTestPath,
        from_index: 0,
        to_index: 2,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('moved');
      expect(result.content[0].text).toContain('0');
      expect(result.content[0].text).toContain('2');
    });

    it('should handle notebook_move_cell same position', async () => {
      const result = await handleNotebookTool('notebook_move_cell', {
        path: '/tmp/mcp-move-test.ipynb',
        from_index: 1,
        to_index: 1,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('no change');
    });

    it('should handle notebook_move_cell invalid index', async () => {
      const result = await handleNotebookTool('notebook_move_cell', {
        path: '/tmp/mcp-move-test.ipynb',
        from_index: 99,
        to_index: 0,
      }, client);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('out of range');
    });

    it('should handle notebook_duplicate_cell', async () => {
      // Create a test notebook for duplicate operations
      const dupTestPath = '/tmp/mcp-dup-test.ipynb';
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          { cell_type: 'code', source: 'original', metadata: {}, outputs: [] },
          { cell_type: 'markdown', source: '# Header', metadata: {} },
        ],
      };
      await client.writeFile(dupTestPath, JSON.stringify(notebook, null, 2));

      // Duplicate cell 0
      const result = await handleNotebookTool('notebook_duplicate_cell', {
        path: dupTestPath,
        cell_index: 0,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('duplicated');
      expect(result.content[0].text).toContain('position 1');
      expect(result.content[0].text).toContain('3 cells');
    });

    it('should handle notebook_duplicate_cell invalid index', async () => {
      const result = await handleNotebookTool('notebook_duplicate_cell', {
        path: '/tmp/mcp-dup-test.ipynb',
        cell_index: 99,
      }, client);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('out of range');
    });
  });

  // ===========================================================================
  // Execution Tool Handler Tests
  // ===========================================================================
  describe('Execution Tool Handlers', () => {
    let sessionId: string;

    beforeAll(async () => {
      const kernelResult = await client.startKernel('python3');
      sessionId = kernelResult.data!.sessionId;
    });

    afterAll(async () => {
      if (sessionId) {
        await client.shutdownKernel(sessionId);
      }
    });

    it('should handle execute_code', async () => {
      const result = await handleExecutionTool('execute_code', {
        session_id: sessionId,
        code: 'print("Hello from execute_code")',
        timeout: 30,
      }, client);

      expect(result.isError).toBeFalsy();
      const hasOutput = result.content.some(c =>
        c.type === 'text' && c.text.includes('Hello from execute_code')
      );
      expect(hasOutput).toBe(true);
    });

    it('should handle execute_code with computation', async () => {
      const result = await handleExecutionTool('execute_code', {
        session_id: sessionId,
        code: 'sum([1, 2, 3, 4, 5])',
        timeout: 30,
      }, client);

      expect(result.isError).toBeFalsy();
      const hasOutput = result.content.some(c =>
        c.type === 'text' && c.text.includes('15')
      );
      expect(hasOutput).toBe(true);
    });

    it('should handle execute_code with no output', async () => {
      const result = await handleExecutionTool('execute_code', {
        session_id: sessionId,
        code: 'x = 10',
        timeout: 30,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('no output');
    });

    it('should handle execute_cell', async () => {
      // Create a notebook with executable cells
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          { cell_type: 'code', source: 'print("Cell executed!")', metadata: {}, outputs: [] },
        ],
      };
      await client.writeFile('/tmp/exec-cell-test.ipynb', JSON.stringify(notebook, null, 2));

      const result = await handleExecutionTool('execute_cell', {
        path: '/tmp/exec-cell-test.ipynb',
        cell_index: 0,
        session_id: sessionId,
        timeout: 30,
      }, client);

      expect(result.isError).toBeFalsy();
      const hasOutput = result.content.some(c =>
        c.type === 'text' && c.text.includes('Cell executed!')
      );
      expect(hasOutput).toBe(true);
    });

    it('should handle execute_cell with invalid index', async () => {
      const result = await handleExecutionTool('execute_cell', {
        path: '/tmp/exec-cell-test.ipynb',
        cell_index: 999,
        session_id: sessionId,
        timeout: 30,
      }, client);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('out of range');
    });

    it('should handle unknown execution tool', async () => {
      const result = await handleExecutionTool('unknown_tool', {}, client);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown execution tool');
    });
  });

  // ===========================================================================
  // File Tool Handler Tests
  // ===========================================================================
  describe('File Tool Handlers', () => {
    const TEST_FILE = '/tmp/mcp-file-test.txt';

    it('should handle list_files', async () => {
      const result = await handleFileTool('list_files', { path: '/tmp' }, client);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Contents of');
    });

    it('should handle list_files with default path', async () => {
      const result = await handleFileTool('list_files', {}, client);
      expect(result.isError).toBeFalsy();
    });

    it('should handle write_file', async () => {
      const result = await handleFileTool('write_file', {
        path: TEST_FILE,
        content: 'Line 1\nLine 2\nLine 3',
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Wrote');
      expect(result.content[0].text).toContain('3 lines');
    });

    it('should handle read_file', async () => {
      const result = await handleFileTool('read_file', {
        path: TEST_FILE,
        max_lines: 200,
      }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('File:');
      expect(result.content[0].text).toContain('Line 1');
      expect(result.content[0].text).toContain('Line 2');
    });

    it('should handle list_files with pattern filter', async () => {
      // First create some test files
      await client.writeFile('/tmp/test-pattern-1.txt', 'test');
      await client.writeFile('/tmp/test-pattern-2.txt', 'test');

      const result = await handleFileTool('list_files', {
        path: '/tmp',
        pattern: 'test-pattern-*.txt',
      }, client);

      expect(result.isError).toBeFalsy();
      // Should contain the pattern files
    });

    it('should handle read_file with non-existent file', async () => {
      const result = await handleFileTool('read_file', {
        path: '/tmp/nonexistent-file-12345.txt',
      }, client);

      expect(result.isError).toBe(true);
    });

    it('should handle unknown file tool', async () => {
      const result = await handleFileTool('unknown_tool', {}, client);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown file tool');
    });
  });
});
