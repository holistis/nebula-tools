/**
 * Integration Tests for MCP Tool Execution
 *
 * Tests the tool execution pipeline with a live server.
 * Requires Nebula server running at http://localhost:8000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NebulaClient } from '../notebook/client.js';
import { executeToolForMCP, executeToolByName, hasTool } from '../tools/index.js';

const TEST_NOTEBOOK_PATH = '/tmp/mcp-test-notebook.ipynb';

const NEBULA_URL = process.env.NEBULA_URL || 'http://localhost:8000';

describe('MCP Tool Execution Integration', () => {
  let client: NebulaClient;

  beforeAll(async () => {
    client = new NebulaClient({ baseUrl: NEBULA_URL });

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
  // executeToolForMCP Tests
  // ===========================================================================
  describe('executeToolForMCP', () => {
    it('should execute known tools and return MCP content', async () => {
      const result = await executeToolForMCP('read_notebook', { path: TEST_NOTEBOOK_PATH }, client);

      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');
    });

    it('should return error for unknown tools', async () => {
      const result = await executeToolForMCP('nonexistent_tool', {}, client);

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('Unknown tool');
    });

    it('should handle tool execution errors gracefully', async () => {
      const result = await executeToolForMCP('read_notebook', { path: '/nonexistent/notebook.ipynb' }, client);

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
    });
  });

  // ===========================================================================
  // executeToolByName Tests
  // ===========================================================================
  describe('executeToolByName', () => {
    it('should execute tool and return raw result', async () => {
      const result = await executeToolByName('read_notebook', { path: TEST_NOTEBOOK_PATH }, client);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return error for unknown tools', async () => {
      const result = await executeToolByName('nonexistent_tool', {}, client);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });

  // ===========================================================================
  // Kernel Tool Execution Tests
  // ===========================================================================
  describe('Kernel Tools', () => {
    let sessionId: string;

    it('should execute list_kernels with display names', async () => {
      const result = await executeToolForMCP('list_kernels', {}, client);
      expect(result.isError).toBeFalsy();
      // Should show kernels with display names
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toMatch(/kernel|python/i);
    });

    it('should execute kernel_start', async () => {
      const result = await executeToolForMCP('kernel_start', { kernel_name: 'python3' }, client);
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('Kernel started');

      // Extract session ID for later tests
      const match = (result.content[0] as { type: 'text'; text: string }).text.match(/Kernel started: ([^\s]+)/);
      if (match) {
        sessionId = match[1];
      }
    }, 30000);

    it('should execute kernel_restart', async () => {
      if (!sessionId) return;

      const result = await executeToolForMCP('kernel_restart', { session_id: sessionId }, client);
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('restarted');
    });

    it('should execute kernel_interrupt', async () => {
      if (!sessionId) return;

      const result = await executeToolForMCP('kernel_interrupt', { session_id: sessionId }, client);
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('interrupted');
    });

    it('should execute kernel_stop', async () => {
      if (!sessionId) return;

      const result = await executeToolForMCP('kernel_stop', { session_id: sessionId }, client);
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('stopped');
    });
  });

  // ===========================================================================
  // Notebook Tool Execution Tests
  // ===========================================================================
  describe('Notebook Tools', () => {
    it('should execute read_notebook with brief format', async () => {
      const result = await executeToolForMCP('read_notebook', {
        path: TEST_NOTEBOOK_PATH,
        format: 'brief',
      }, client);

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('Notebook:');
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('3 cells');
    });

    it('should execute read_cell', async () => {
      const result = await executeToolForMCP('read_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 1,
      }, client);

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('Cell 1');
    });

    it('should execute write_cell (append)', async () => {
      const result = await executeToolForMCP('write_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: -1,
        cell_id: 'test-appended-cell',
        content: 'print("Appended cell")',
        cell_type: 'code',
      }, client);

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('test-appended-cell');
    });

    it('should execute search_cells', async () => {
      const result = await executeToolForMCP('search_cells', {
        path: TEST_NOTEBOOK_PATH,
        query: 'print',
        limit: 5,
      }, client);

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('Found');
    });

    it('should execute search_cells with no results', async () => {
      const result = await executeToolForMCP('search_cells', {
        path: TEST_NOTEBOOK_PATH,
        query: 'xyznonexistent123',
        limit: 5,
      }, client);

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('No matching');
    });

    it('should execute delete_cell', async () => {
      const result = await executeToolForMCP('delete_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 3,
      }, client);

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('deleted');
    });

    it('should handle read_cell with invalid index', async () => {
      const result = await executeToolForMCP('read_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 999,
      }, client);

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('out of range');
    });

    it('should handle read_notebook with non-existent file', async () => {
      const result = await executeToolForMCP('read_notebook', {
        path: '/tmp/nonexistent-12345.ipynb',
      }, client);

      expect(result.isError).toBe(true);
    });

    it('should execute move_cell', async () => {
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

      const result = await executeToolForMCP('move_cell', {
        path: moveTestPath,
        from_index: 0,
        to_index: 2,
      }, client);

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('moved');
    });

    it('should execute duplicate_cell', async () => {
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

      const result = await executeToolForMCP('duplicate_cell', {
        path: dupTestPath,
        cell_index: 0,
      }, client);

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('duplicated');
    });
  });

  // ===========================================================================
  // Execution Tool Tests
  // ===========================================================================
  describe('Execution Tools', () => {
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

    it('should execute execute_cell', async () => {
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          { cell_type: 'code', source: 'print("Cell executed!")', metadata: {}, outputs: [] },
        ],
      };
      await client.writeFile('/tmp/exec-cell-test.ipynb', JSON.stringify(notebook, null, 2));

      const result = await executeToolForMCP('execute_cell', {
        path: '/tmp/exec-cell-test.ipynb',
        cell_index: 0,
        session_id: sessionId,
        max_wait: 30,
      }, client);

      expect(result.isError).toBeFalsy();
      const hasOutput = result.content.some(c =>
        c.type === 'text' && (c as { type: 'text'; text: string }).text.includes('Cell executed!')
      );
      expect(hasOutput).toBe(true);
    });

    it('should handle execute_cell with invalid index', async () => {
      const result = await executeToolForMCP('execute_cell', {
        path: '/tmp/exec-cell-test.ipynb',
        cell_index: 999,
        session_id: sessionId,
        max_wait: 30,
      }, client);

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('out of range');
    });
  });

  // ===========================================================================
  // Removed Tools Verification
  // ===========================================================================
  describe('Removed Tools', () => {
    it('should not have execute_code tool', () => {
      expect(hasTool('execute_code')).toBe(false);
    });

    it('should not have file tools', () => {
      expect(hasTool('list_files')).toBe(false);
      expect(hasTool('read_file')).toBe(false);
      expect(hasTool('write_file')).toBe(false);
    });

    it('should not have list_sessions tool', () => {
      expect(hasTool('list_sessions')).toBe(false);
    });

    it('should not have python tools', () => {
      expect(hasTool('list_python_environments')).toBe(false);
      expect(hasTool('get_python_info')).toBe(false);
    });
  });
});
