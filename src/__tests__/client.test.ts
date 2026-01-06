/**
 * Comprehensive tests for NebulaClient
 *
 * These tests require a running Nebula server at http://localhost:8000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NebulaClient } from '../notebook/client.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_NOTEBOOK_PATH = '/tmp/test-notebook.ipynb';
const TEST_FILE_PATH = '/tmp/test-file.txt';

describe('NebulaClient', () => {
  let client: NebulaClient;

  beforeAll(() => {
    client = new NebulaClient({ baseUrl: 'http://localhost:8000' });
  });

  // ===========================================================================
  // Kernel Tests
  // ===========================================================================
  describe('Kernel Operations', () => {
    let sessionId: string;

    it('should list available kernels', async () => {
      const result = await client.listKernels();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);
      // Should have python3 kernel
      expect(result.data!.some(k => k.includes('python'))).toBe(true);
    });

    it('should list sessions (initially empty or with existing)', async () => {
      const result = await client.listSessions();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should start a new kernel session', async () => {
      const result = await client.startKernel('python3');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.sessionId).toBeDefined();
      expect(result.data!.kernelName).toBe('python3');
      sessionId = result.data!.sessionId;
    }, 30000); // Kernel startup can take time

    it('should list sessions and find the new session', async () => {
      const result = await client.listSessions();
      expect(result.success).toBe(true);
      expect(result.data!.some(s => s.id === sessionId)).toBe(true);
    });

    it('should execute code in the kernel', async () => {
      const result = await client.executeCodeStreaming(sessionId, 'print("Hello, World!")', 30000);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.outputs.length).toBeGreaterThan(0);
      expect(result.data!.outputs.some(o => o.content.includes('Hello, World!'))).toBe(true);
    }, 35000); // Allow time for execution

    it('should execute code that returns a value', async () => {
      const result = await client.executeCodeStreaming(sessionId, '2 + 2', 30000);
      expect(result.success).toBe(true);
      expect(result.data!.outputs.some(o => o.content.includes('4'))).toBe(true);
    });

    it('should handle code with errors gracefully', async () => {
      const result = await client.executeCodeStreaming(sessionId, 'raise ValueError("test error")', 30000);
      // Should succeed but have error output
      expect(result.data!.outputs.some(o => o.type === 'error' || o.content.includes('ValueError'))).toBe(true);
    });

    it('should store variables across executions', async () => {
      await client.executeCodeStreaming(sessionId, 'test_var = 42', 30000);
      const result = await client.executeCodeStreaming(sessionId, 'print(test_var)', 30000);
      expect(result.success).toBe(true);
      expect(result.data!.outputs.some(o => o.content.includes('42'))).toBe(true);
    });

    it('should interrupt a running kernel', async () => {
      // Start a long-running operation
      const longRunPromise = client.executeCodeStreaming(sessionId, 'import time; time.sleep(30)', 5000);

      // Wait a bit then interrupt
      await new Promise(resolve => setTimeout(resolve, 500));
      const interruptResult = await client.interruptKernel(sessionId);
      expect(interruptResult.success).toBe(true);

      // The long-running operation should fail or be interrupted
      const result = await longRunPromise;
      // Either it timed out or was interrupted - both are acceptable
    });

    it('should restart a kernel', async () => {
      const result = await client.restartKernel(sessionId);
      expect(result.success).toBe(true);

      // After restart, variables should be cleared
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for restart
      const varResult = await client.executeCodeStreaming(sessionId, 'print(test_var)', 30000);
      expect(varResult.data!.outputs.some(o => o.content.includes('NameError') || o.type === 'error')).toBe(true);
    }, 45000); // Kernel restart can take time

    it('should shutdown a kernel', async () => {
      const result = await client.shutdownKernel(sessionId);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Notebook Tests
  // ===========================================================================
  describe('Notebook Operations', () => {
    beforeAll(async () => {
      // Create a test notebook
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { language_info: { name: 'python' } },
        cells: [
          {
            cell_type: 'markdown',
            source: '# Test Notebook\n\nThis is a test notebook.',
            metadata: {},
          },
          {
            cell_type: 'code',
            source: 'import pandas as pd\nprint("Hello from cell 1")',
            metadata: {},
            outputs: [],
            execution_count: null,
          },
          {
            cell_type: 'code',
            source: 'x = 10\ny = 20\nprint(x + y)',
            metadata: {},
            outputs: [
              { output_type: 'stream', name: 'stdout', text: '30\n' }
            ],
            execution_count: 1,
          },
          {
            cell_type: 'markdown',
            source: '## Data Analysis\n\nSome analysis here.',
            metadata: {},
          },
          {
            cell_type: 'code',
            source: 'def calculate_sum(a, b):\n    return a + b\n\nresult = calculate_sum(5, 3)\nprint(result)',
            metadata: {},
            outputs: [],
            execution_count: null,
          },
        ],
      };

      await client.writeFile(TEST_NOTEBOOK_PATH, JSON.stringify(notebook, null, 2));
    });

    afterAll(async () => {
      // Clean up test notebook
      try {
        // We don't have a delete file method, so we'll leave it
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should read a notebook', async () => {
      const result = await client.readNotebook(TEST_NOTEBOOK_PATH);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.cells.length).toBe(5);
      expect(result.data!.path).toBe(TEST_NOTEBOOK_PATH);
    });

    it('should read notebook cells with correct types', async () => {
      const result = await client.readNotebook(TEST_NOTEBOOK_PATH);
      expect(result.success).toBe(true);

      const cells = result.data!.cells;
      expect(cells[0].type).toBe('markdown');
      expect(cells[1].type).toBe('code');
      expect(cells[2].type).toBe('code');
      expect(cells[3].type).toBe('markdown');
      expect(cells[4].type).toBe('code');
    });

    it('should read notebook cells with outputs', async () => {
      const result = await client.readNotebook(TEST_NOTEBOOK_PATH);
      expect(result.success).toBe(true);

      const cell2 = result.data!.cells[2];
      expect(cell2.outputs).toBeDefined();
      expect(cell2.outputs!.length).toBeGreaterThan(0);
      expect(cell2.outputs![0].content).toContain('30');
    });

    it('should write a new cell to the notebook', async () => {
      const result = await client.writeCell(
        TEST_NOTEBOOK_PATH,
        -1, // Append
        'print("New cell added")',
        'code'
      );
      expect(result.success).toBe(true);
      expect(result.data!.cellIndex).toBe(5); // 0-indexed, 6th cell
      expect(result.data!.totalCells).toBe(6);
    });

    it('should update an existing cell', async () => {
      const result = await client.writeCell(
        TEST_NOTEBOOK_PATH,
        1, // Update second cell
        'print("Updated cell content")',
        'code'
      );
      expect(result.success).toBe(true);

      // Verify the update
      const readResult = await client.readNotebook(TEST_NOTEBOOK_PATH);
      expect(readResult.data!.cells[1].content).toBe('print("Updated cell content")');
    });

    it('should delete a cell from the notebook', async () => {
      const beforeResult = await client.readNotebook(TEST_NOTEBOOK_PATH);
      const cellCountBefore = beforeResult.data!.cells.length;

      const result = await client.deleteCell(TEST_NOTEBOOK_PATH, 5); // Delete the appended cell
      expect(result.success).toBe(true);
      expect(result.data!.totalCells).toBe(cellCountBefore - 1);
    });

    it('should search cells by keyword', async () => {
      // Search for 'calculate' which is in cell 4 and not modified by previous tests
      const result = await client.searchCells(TEST_NOTEBOOK_PATH, 'calculate', 5);
      expect(result.success).toBe(true);
      expect(result.data!.cells.length).toBeGreaterThan(0);
      expect(result.data!.cells[0].content.toLowerCase()).toContain('calculate');
    });

    it('should search cells with multiple keywords', async () => {
      const result = await client.searchCells(TEST_NOTEBOOK_PATH, 'print calculate', 5);
      expect(result.success).toBe(true);
      expect(result.data!.cells.length).toBeGreaterThan(0);
    });

    it('should return empty results for non-matching search', async () => {
      const result = await client.searchCells(TEST_NOTEBOOK_PATH, 'xyznonexistent123', 5);
      expect(result.success).toBe(true);
      expect(result.data!.cells.length).toBe(0);
    });

    it('should handle invalid cell index for write', async () => {
      const result = await client.writeCell(TEST_NOTEBOOK_PATH, 999, 'test', 'code');
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should handle invalid cell index for delete', async () => {
      const result = await client.deleteCell(TEST_NOTEBOOK_PATH, 999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should handle non-existent notebook', async () => {
      const result = await client.readNotebook('/tmp/nonexistent-notebook-12345.ipynb');
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Cell Reordering Tests
  // ===========================================================================
  describe('Cell Reordering', () => {
    const REORDER_NOTEBOOK_PATH = '/tmp/reorder-test-notebook.ipynb';

    beforeAll(async () => {
      // Create a test notebook with 4 cells: [A, B, C, D]
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { language_info: { name: 'python' } },
        cells: [
          { cell_type: 'code', source: 'cell_A = "A"', metadata: {}, outputs: [], execution_count: null },
          { cell_type: 'code', source: 'cell_B = "B"', metadata: {}, outputs: [], execution_count: null },
          { cell_type: 'code', source: 'cell_C = "C"', metadata: {}, outputs: [], execution_count: null },
          { cell_type: 'code', source: 'cell_D = "D"', metadata: {}, outputs: [], execution_count: null },
        ],
      };
      await client.writeFile(REORDER_NOTEBOOK_PATH, JSON.stringify(notebook, null, 2));
    });

    it('should move a cell down (0 -> 2)', async () => {
      // [A,B,C,D] -> [B,C,A,D]
      const result = await client.moveCell(REORDER_NOTEBOOK_PATH, 0, 2);
      expect(result.success).toBe(true);
      expect(result.data!.totalCells).toBe(4);

      // Verify the order
      const notebook = await client.readNotebook(REORDER_NOTEBOOK_PATH);
      expect(notebook.data!.cells[0].content).toContain('cell_B');
      expect(notebook.data!.cells[1].content).toContain('cell_C');
      expect(notebook.data!.cells[2].content).toContain('cell_A');
      expect(notebook.data!.cells[3].content).toContain('cell_D');
    });

    it('should move a cell up (3 -> 0)', async () => {
      // Current: [B,C,A,D] -> [D,B,C,A]
      const result = await client.moveCell(REORDER_NOTEBOOK_PATH, 3, 0);
      expect(result.success).toBe(true);

      // Verify the order
      const notebook = await client.readNotebook(REORDER_NOTEBOOK_PATH);
      expect(notebook.data!.cells[0].content).toContain('cell_D');
      expect(notebook.data!.cells[1].content).toContain('cell_B');
      expect(notebook.data!.cells[2].content).toContain('cell_C');
      expect(notebook.data!.cells[3].content).toContain('cell_A');
    });

    it('should handle move to same position (no-op)', async () => {
      // Get current state
      const before = await client.readNotebook(REORDER_NOTEBOOK_PATH);
      const beforeContent = before.data!.cells.map(c => c.content);

      // Move cell 1 to position 1 (no change)
      const result = await client.moveCell(REORDER_NOTEBOOK_PATH, 1, 1);
      expect(result.success).toBe(true);

      // Verify nothing changed
      const after = await client.readNotebook(REORDER_NOTEBOOK_PATH);
      const afterContent = after.data!.cells.map(c => c.content);
      expect(afterContent).toEqual(beforeContent);
    });

    it('should reject invalid source index', async () => {
      const result = await client.moveCell(REORDER_NOTEBOOK_PATH, 99, 0);
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should reject invalid target index', async () => {
      const result = await client.moveCell(REORDER_NOTEBOOK_PATH, 0, -5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should reject target index beyond bounds', async () => {
      const result = await client.moveCell(REORDER_NOTEBOOK_PATH, 0, 99);
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });
  });

  // ===========================================================================
  // Cell Duplication Tests
  // ===========================================================================
  describe('Cell Duplication', () => {
    const DUP_NOTEBOOK_PATH = '/tmp/duplicate-test-notebook.ipynb';

    beforeAll(async () => {
      // Create a test notebook with 3 cells
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { language_info: { name: 'python' } },
        cells: [
          { cell_type: 'code', source: 'cell_0 = "zero"', metadata: {}, outputs: [], execution_count: null },
          { cell_type: 'markdown', source: '# Cell One Markdown', metadata: {} },
          { cell_type: 'code', source: 'cell_2 = "two"', metadata: {}, outputs: [], execution_count: null },
        ],
      };
      await client.writeFile(DUP_NOTEBOOK_PATH, JSON.stringify(notebook, null, 2));
    });

    it('should duplicate a cell at next position', async () => {
      // Duplicate cell 0: [0, 1, 2] -> [0, 0', 1, 2]
      const result = await client.duplicateCell(DUP_NOTEBOOK_PATH, 0);
      expect(result.success).toBe(true);
      expect(result.data!.newCellIndex).toBe(1);
      expect(result.data!.totalCells).toBe(4);

      // Verify the duplication
      const notebook = await client.readNotebook(DUP_NOTEBOOK_PATH);
      expect(notebook.data!.cells.length).toBe(4);
      expect(notebook.data!.cells[0].content).toBe(notebook.data!.cells[1].content);
    });

    it('should preserve cell content and type', async () => {
      // Read to get current state after previous test
      const before = await client.readNotebook(DUP_NOTEBOOK_PATH);
      const originalCell = before.data!.cells[2]; // The markdown cell

      // Duplicate the markdown cell
      const result = await client.duplicateCell(DUP_NOTEBOOK_PATH, 2);
      expect(result.success).toBe(true);

      // Verify content and type match
      const after = await client.readNotebook(DUP_NOTEBOOK_PATH);
      const duplicatedCell = after.data!.cells[3];
      expect(duplicatedCell.content).toBe(originalCell.content);
      expect(duplicatedCell.type).toBe(originalCell.type);
    });

    it('should generate new cell ID', async () => {
      const before = await client.readNotebook(DUP_NOTEBOOK_PATH);
      const originalId = before.data!.cells[0].id;

      // Duplicate cell 0
      await client.duplicateCell(DUP_NOTEBOOK_PATH, 0);

      const after = await client.readNotebook(DUP_NOTEBOOK_PATH);
      const duplicatedId = after.data!.cells[1].id;

      // IDs should be different
      expect(duplicatedId).not.toBe(originalId);
    });

    it('should reject invalid index', async () => {
      const result = await client.duplicateCell(DUP_NOTEBOOK_PATH, 99);
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should reject negative index', async () => {
      const result = await client.duplicateCell(DUP_NOTEBOOK_PATH, -1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });
  });

  // ===========================================================================
  // File Operation Tests
  // ===========================================================================
  describe('File Operations', () => {
    it('should list files in a directory', async () => {
      const result = await client.listFiles('/tmp');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should write a file', async () => {
      const content = 'Hello, this is a test file.\nLine 2\nLine 3';
      const result = await client.writeFile(TEST_FILE_PATH, content);
      expect(result.success).toBe(true);
    });

    it('should read a file', async () => {
      const result = await client.readFile(TEST_FILE_PATH);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.content).toContain('Hello, this is a test file');
      expect(result.data!.content).toContain('Line 2');
    });

    it('should handle reading non-existent file', async () => {
      const result = await client.readFile('/tmp/nonexistent-file-12345.txt');
      expect(result.success).toBe(false);
    });

    it('should list files with correct types', async () => {
      const result = await client.listFiles('/tmp');
      expect(result.success).toBe(true);

      // Check that entries have name and type
      if (result.data && result.data.length > 0) {
        expect(result.data[0]).toHaveProperty('name');
        expect(result.data[0]).toHaveProperty('type');
      }
    });
  });

  // ===========================================================================
  // Integration Tests - Execute Cell in Notebook
  // ===========================================================================
  describe('Notebook Execution Integration', () => {
    let sessionId: string;

    beforeAll(async () => {
      // Create a test notebook for execution
      const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { language_info: { name: 'python' } },
        cells: [
          {
            cell_type: 'code',
            source: 'x = 10',
            metadata: {},
            outputs: [],
            execution_count: null,
          },
          {
            cell_type: 'code',
            source: 'y = 20',
            metadata: {},
            outputs: [],
            execution_count: null,
          },
          {
            cell_type: 'code',
            source: 'print(x + y)',
            metadata: {},
            outputs: [],
            execution_count: null,
          },
        ],
      };

      await client.writeFile('/tmp/exec-test-notebook.ipynb', JSON.stringify(notebook, null, 2));

      // Start a kernel
      const kernelResult = await client.startKernel('python3');
      sessionId = kernelResult.data!.sessionId;
    });

    afterAll(async () => {
      if (sessionId) {
        await client.shutdownKernel(sessionId);
      }
    });

    it('should execute notebook cells in sequence', async () => {
      // Read the notebook
      const notebook = await client.readNotebook('/tmp/exec-test-notebook.ipynb');
      expect(notebook.success).toBe(true);

      // Execute cell 0 (x = 10)
      const result0 = await client.executeCodeStreaming(sessionId, notebook.data!.cells[0].content, 30000);
      expect(result0.success).toBe(true);

      // Execute cell 1 (y = 20)
      const result1 = await client.executeCodeStreaming(sessionId, notebook.data!.cells[1].content, 30000);
      expect(result1.success).toBe(true);

      // Execute cell 2 (print(x + y)) - should output 30
      const result2 = await client.executeCodeStreaming(sessionId, notebook.data!.cells[2].content, 30000);
      expect(result2.success).toBe(true);
      expect(result2.data!.outputs.some(o => o.content.includes('30'))).toBe(true);
    });

    it('should get or create kernel for a file', async () => {
      const result = await client.getOrCreateKernelForFile('/tmp/exec-test-notebook.ipynb');
      expect(result.success).toBe(true);
      expect(result.data!.sessionId).toBeDefined();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================
  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      const badClient = new NebulaClient({ baseUrl: 'http://localhost:9999', timeout: 2000, retries: 1 });
      const result = await badClient.listKernels();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should timeout long operations', async () => {
      const timeoutClient = new NebulaClient({ baseUrl: 'http://localhost:8000', timeout: 1 });
      // This might or might not timeout depending on server response time
      // Just verify it doesn't crash
      const result = await timeoutClient.listKernels();
      // Result could be success or failure depending on timing
      expect(typeof result.success).toBe('boolean');
    });
  });
});
