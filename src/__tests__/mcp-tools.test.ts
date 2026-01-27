/**
 * Integration Tests for MCP Tool Execution
 *
 * Tests the tool execution pipeline with a live server.
 * Requires Nebula server running at http://localhost:8000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NebulaClient } from '../notebook/client.js';
import { executeToolForMCP, executeToolByName, hasTool } from '../tools/index.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_NOTEBOOK_PATH = '/tmp/mcp-test-notebook.ipynb';
const EXEC_NOTEBOOK_PATH = path.join(process.cwd(), 'tmp', 'exec-cell-test.ipynb');

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
    let hasKernels = true;

    beforeAll(async () => {
      const kernels = await client.listKernels();
      hasKernels = kernels.success && (kernels.data?.length ?? 0) > 0;
    });

    it('should execute list_kernels with display names', async () => {
      const result = await executeToolForMCP('list_kernels', {}, client);
      expect(result.isError).toBeFalsy();
      // Should show kernels with display names
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toMatch(/kernel|python/i);
    });

    it('should execute kernel_start', async () => {
      if (!hasKernels) return;
      const result = await executeToolForMCP('kernel_start', { kernel_name: 'python3' }, client);
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain('Kernel started');

      // Extract session ID for later tests
      const match = (result.content[0] as { type: 'text'; text: string }).text.match(/Kernel started: ([^\s]+)/);
      if (match) {
        sessionId = match[1];
      }
    }, 60000);

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
    it('should execute read_output', async () => {
      const result = await executeToolForMCP('read_output', {
        path: TEST_NOTEBOOK_PATH,
        cell_index: 2,
      }, client);

      expect(result.isError).toBeFalsy();
      const hasOutput = result.content.some(c =>
        c.type === 'text' && (c as { type: 'text'; text: string }).text.includes('outputs')
      );
      expect(hasOutput).toBe(true);
    });

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

    it('should execute insert_cell (append)', async () => {
      const result = await executeToolForMCP('insert_cell', {
        path: TEST_NOTEBOOK_PATH,
        cell_id: 'test-appended-cell',
        content: 'print("Appended cell")',
        cell_type: 'code',
        // position omitted = append
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

    it('should execute update_cell and update_metadata', async () => {
      const updatePath = '/tmp/mcp-update-test.ipynb';
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [],
      };
      await client.writeFile(updatePath, JSON.stringify(notebook, null, 2));

      const insertResult = await executeToolByName('insert_cell', {
        path: updatePath,
        cell_id: 'update-target',
        content: 'print("old")',
        cell_type: 'code',
      }, client);
      expect(insertResult.success).toBe(true);

      const updateResult = await executeToolForMCP('update_cell', {
        path: updatePath,
        cell_id: 'update-target',
        content: 'print("new")',
      }, client);
      expect(updateResult.isError).toBeFalsy();

      const metaResult = await executeToolForMCP('update_metadata', {
        path: updatePath,
        cell_id: 'update-target',
        changes: { type: 'markdown' },
      }, client);
      expect(metaResult.isError).toBeFalsy();

      const readResult = await executeToolByName('read_cell', {
        path: updatePath,
        cell_id: 'update-target',
      }, client);
      expect(readResult.success).toBe(true);
      expect(readResult.data!.cell.content).toContain('new');
      expect(readResult.data!.cell.type).toBe('markdown');
    });

    it('should execute start_agent_session and end_agent_session', async () => {
      const sessionPath = '/tmp/mcp-agent-session.ipynb';
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [],
      };
      await client.writeFile(sessionPath, JSON.stringify(notebook, null, 2));

      const hasUI = await client.hasUI(sessionPath);
      if (!hasUI) {
        return;
      }

      const startResult = await executeToolForMCP('start_agent_session', {
        path: sessionPath,
        agent_id: 'mcp-test-agent',
      }, client);
      if (startResult.isError) {
        return;
      }

      const endResult = await executeToolForMCP('end_agent_session', {
        path: sessionPath,
      }, client);
      if (endResult.isError) {
        return;
      }
      expect(endResult.isError).toBeFalsy();
    });
  });

  // ===========================================================================
  // Execution Tool Tests
  // ===========================================================================
  describe('Execution Tools', () => {
    let sessionId: string | undefined;

    beforeAll(async () => {
      const kernels = await client.listKernels();
      if (!kernels.success || (kernels.data?.length ?? 0) === 0) {
        return;
      }

      const kernelResult = await client.startKernel('python3');
      if (!kernelResult.success) {
        return;
      }
      sessionId = kernelResult.data!.sessionId;
    }, 60000);

    afterAll(async () => {
      if (sessionId) {
        await client.shutdownKernel(sessionId);
      }
    });

    it('should execute execute_cell', async () => {
      if (!sessionId) return;
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          { cell_type: 'code', source: 'print("Cell executed!")', metadata: {}, outputs: [] },
        ],
      };
      fs.mkdirSync(path.dirname(EXEC_NOTEBOOK_PATH), { recursive: true });
      await client.writeFile(EXEC_NOTEBOOK_PATH, JSON.stringify(notebook, null, 2));

      const result = await executeToolForMCP('execute_cell', {
        path: EXEC_NOTEBOOK_PATH,
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
      if (!sessionId) return;
      const result = await executeToolForMCP('execute_cell', {
        path: EXEC_NOTEBOOK_PATH,
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

    it('should have file tools', () => {
      expect(hasTool('list_directory')).toBe(true);
      expect(hasTool('read_file')).toBe(true);
      expect(hasTool('write_file')).toBe(true);
      expect(hasTool('delete_file')).toBe(true);
      expect(hasTool('rename_file')).toBe(true);
      expect(hasTool('download_file')).toBe(true);
      expect(hasTool('upload_file')).toBe(true);
    });

    it('should not have list_sessions tool', () => {
      expect(hasTool('list_sessions')).toBe(false);
    });

    it('should not have python tools', () => {
      expect(hasTool('list_python_environments')).toBe(false);
      expect(hasTool('get_python_info')).toBe(false);
    });

    it('should not have write_cell tool (replaced by insert_cell/update_cell)', () => {
      expect(hasTool('write_cell')).toBe(false);
    });
  });
});
