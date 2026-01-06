/**
 * Tests for Cell ID tracking and metadata handling in MCP operations
 *
 * Verifies that:
 * 1. Cell IDs are properly assigned and preserved
 * 2. Auto-fix for duplicate IDs works correctly
 * 3. Metadata updates work correctly
 * 4. ID changes are tracked properly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NebulaClient } from '../notebook/client.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Cell ID Tracking', () => {
  let client: NebulaClient;
  let testDir: string;
  let testNotebookPath: string;

  beforeEach(() => {
    client = new NebulaClient({ baseUrl: 'http://localhost:8000' });
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-test-'));
    testNotebookPath = path.join(testDir, 'test-notebook.ipynb');

    // Create a test notebook with known cell IDs
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { name: 'python3' } },
      cells: [
        {
          cell_type: 'code',
          source: 'print("Cell 1")',
          metadata: { nebula_id: 'existing-cell-1' },
          outputs: [],
          execution_count: null,
        },
        {
          cell_type: 'code',
          source: 'print("Cell 2")',
          metadata: { nebula_id: 'existing-cell-2' },
          outputs: [],
          execution_count: null,
        },
      ],
    };
    fs.writeFileSync(testNotebookPath, JSON.stringify(notebook, null, 2));
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testNotebookPath)) {
      fs.unlinkSync(testNotebookPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });

  describe('writeCell with cell_id', () => {
    it('should create cell with specified ID', async () => {
      const result = await client.writeCell(
        testNotebookPath,
        -1, // append
        'print("New cell")',
        'code',
        'my-new-cell'
      );

      expect(result.success).toBe(true);
      expect(result.data?.cellId).toBe('my-new-cell');
      expect(result.data?.idModified).toBeFalsy();

      // Verify in notebook file
      const notebook = await client.readNotebook(testNotebookPath);
      expect(notebook.success).toBe(true);
      const newCell = notebook.data?.cells.find((c) => c.id === 'my-new-cell');
      expect(newCell).toBeDefined();
      expect(newCell?.content).toBe('print("New cell")');
    });

    it('should auto-fix duplicate cell ID', async () => {
      const result = await client.writeCell(
        testNotebookPath,
        -1,
        'print("Duplicate ID attempt")',
        'code',
        'existing-cell-1' // This ID already exists
      );

      expect(result.success).toBe(true);
      expect(result.data?.cellId).toBe('existing-cell-1-2'); // Auto-fixed
      expect(result.data?.idModified).toBe(true);
      expect(result.data?.requestedId).toBe('existing-cell-1');
    });

    it('should auto-fix with incrementing suffix', async () => {
      // First, create a cell with ID that will conflict
      await client.writeCell(testNotebookPath, -1, 'cell A', 'code', 'test-id');
      await client.writeCell(testNotebookPath, -1, 'cell B', 'code', 'test-id');

      const result = await client.writeCell(
        testNotebookPath,
        -1,
        'cell C',
        'code',
        'test-id' // Should become test-id-3
      );

      expect(result.success).toBe(true);
      expect(result.data?.cellId).toBe('test-id-3');
    });

    it('should preserve existing cell ID on update', async () => {
      const result = await client.writeCell(
        testNotebookPath,
        0, // Update first cell
        'print("Updated content")',
        'code'
      );

      expect(result.success).toBe(true);
      expect(result.data?.cellId).toBe('existing-cell-1'); // ID preserved

      // Verify content updated but ID preserved
      const notebook = await client.readNotebook(testNotebookPath);
      expect(notebook.data?.cells[0].id).toBe('existing-cell-1');
      expect(notebook.data?.cells[0].content).toBe('print("Updated content")');
    });
  });

  describe('readCell with cell_id', () => {
    it('should find cell by ID', async () => {
      const result = await client.readCell(testNotebookPath, {
        cellId: 'existing-cell-2',
      });

      expect(result.success).toBe(true);
      expect(result.data?.cellIndex).toBe(1);
      expect(result.data?.cellId).toBe('existing-cell-2');
      expect(result.data?.content).toBe('print("Cell 2")');
    });

    it('should return error for non-existent ID', async () => {
      const result = await client.readCell(testNotebookPath, {
        cellId: 'non-existent-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should work with cell index', async () => {
      const result = await client.readCell(testNotebookPath, {
        cellIndex: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.cellId).toBe('existing-cell-1');
    });
  });

  describe('updateCellMetadata', () => {
    it('should update cell type', async () => {
      // Note: This test requires the metadata schema endpoint to be running
      // For unit testing, we'll mock or skip if server not available
      const schemaResult = await client.getMetadataSchema();
      if (!schemaResult.success) {
        console.log('Skipping test - Nebula server not running');
        return;
      }

      const result = await client.updateCellMetadata(
        testNotebookPath,
        'existing-cell-1',
        { type: 'markdown' }
      );

      expect(result.success).toBe(true);
      expect(result.data?.changes.type).toEqual({
        old: 'code',
        new: 'markdown',
      });

      // Verify in notebook
      const notebook = await client.readNotebook(testNotebookPath);
      expect(notebook.data?.cells[0].type).toBe('markdown');
    });

    it('should rename cell ID with auto-fix', async () => {
      const schemaResult = await client.getMetadataSchema();
      if (!schemaResult.success) {
        console.log('Skipping test - Nebula server not running');
        return;
      }

      const result = await client.updateCellMetadata(
        testNotebookPath,
        'existing-cell-1',
        { id: 'renamed-cell' }
      );

      expect(result.success).toBe(true);
      expect(result.data?.cellId).toBe('renamed-cell');
      expect(result.data?.oldCellId).toBe('existing-cell-1');

      // Verify old ID no longer works
      const oldResult = await client.readCell(testNotebookPath, {
        cellId: 'existing-cell-1',
      });
      expect(oldResult.success).toBe(false);

      // Verify new ID works
      const newResult = await client.readCell(testNotebookPath, {
        cellId: 'renamed-cell',
      });
      expect(newResult.success).toBe(true);
    });

    it('should auto-fix duplicate ID on rename', async () => {
      const schemaResult = await client.getMetadataSchema();
      if (!schemaResult.success) {
        console.log('Skipping test - Nebula server not running');
        return;
      }

      // Try to rename to an existing ID
      const result = await client.updateCellMetadata(
        testNotebookPath,
        'existing-cell-1',
        { id: 'existing-cell-2' } // Already exists
      );

      expect(result.success).toBe(true);
      expect(result.data?.cellId).toBe('existing-cell-2-2'); // Auto-fixed
    });

    it('should reject unknown metadata fields', async () => {
      const schemaResult = await client.getMetadataSchema();
      if (!schemaResult.success) {
        console.log('Skipping test - Nebula server not running');
        return;
      }

      const result = await client.updateCellMetadata(
        testNotebookPath,
        'existing-cell-1',
        { unknownField: 'value' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown field');
    });

    it('should validate field types', async () => {
      const schemaResult = await client.getMetadataSchema();
      if (!schemaResult.success) {
        console.log('Skipping test - Nebula server not running');
        return;
      }

      // scrolled should be boolean, not string
      const result = await client.updateCellMetadata(
        testNotebookPath,
        'existing-cell-1',
        { scrolled: 'not-a-boolean' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a boolean');
    });
  });

  describe('Cell ID persistence across operations', () => {
    it('should maintain IDs through read-modify-write cycle', async () => {
      // Read
      const readResult = await client.readNotebook(testNotebookPath);
      expect(readResult.success).toBe(true);
      const originalIds = readResult.data?.cells.map((c) => c.id);

      // Modify (add a cell)
      await client.writeCell(testNotebookPath, -1, 'new cell', 'code', 'new-cell');

      // Read again
      const readResult2 = await client.readNotebook(testNotebookPath);
      expect(readResult2.success).toBe(true);

      // Original IDs should still be present
      expect(readResult2.data?.cells[0].id).toBe(originalIds![0]);
      expect(readResult2.data?.cells[1].id).toBe(originalIds![1]);
      expect(readResult2.data?.cells[2].id).toBe('new-cell');
    });

    it('should maintain ID after content update', async () => {
      const originalId = 'existing-cell-1';

      // Update content
      await client.writeCell(testNotebookPath, 0, 'new content', 'code');

      // Verify ID preserved
      const result = await client.readCell(testNotebookPath, { cellId: originalId });
      expect(result.success).toBe(true);
      expect(result.data?.content).toBe('new content');
    });
  });
});

describe('Agent Operation Tracking', () => {
  // These tests verify that operations produce correct state
  // that can be tracked by the history system

  let client: NebulaClient;
  let testDir: string;
  let testNotebookPath: string;

  beforeEach(() => {
    client = new NebulaClient({ baseUrl: 'http://localhost:8000' });
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-agent-test-'));
    testNotebookPath = path.join(testDir, 'agent-test.ipynb');

    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [],
    };
    fs.writeFileSync(testNotebookPath, JSON.stringify(notebook, null, 2));
  });

  afterEach(() => {
    if (fs.existsSync(testNotebookPath)) fs.unlinkSync(testNotebookPath);
    if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
  });

  it('should track sequence of agent operations', async () => {
    // Simulate a typical agent workflow
    const operations: Array<{ op: string; cellId: string; index: number }> = [];

    // 1. Create cells with meaningful IDs
    const result1 = await client.writeCell(
      testNotebookPath,
      -1,
      'import pandas as pd',
      'code',
      'import-deps'
    );
    operations.push({
      op: 'insert',
      cellId: result1.data!.cellId,
      index: result1.data!.cellIndex,
    });

    const result2 = await client.writeCell(
      testNotebookPath,
      -1,
      'df = pd.read_csv("data.csv")',
      'code',
      'load-data'
    );
    operations.push({
      op: 'insert',
      cellId: result2.data!.cellId,
      index: result2.data!.cellIndex,
    });

    const result3 = await client.writeCell(
      testNotebookPath,
      -1,
      'df.describe()',
      'code',
      'analyze-data'
    );
    operations.push({
      op: 'insert',
      cellId: result3.data!.cellId,
      index: result3.data!.cellIndex,
    });

    // 2. Update a cell
    await client.writeCell(
      testNotebookPath,
      1,
      'df = pd.read_csv("updated_data.csv")',
      'code'
    );
    operations.push({
      op: 'update',
      cellId: 'load-data',
      index: 1,
    });

    // 3. Verify final state
    const notebook = await client.readNotebook(testNotebookPath);
    expect(notebook.success).toBe(true);
    expect(notebook.data?.cells.length).toBe(3);
    expect(notebook.data?.cells.map((c) => c.id)).toEqual([
      'import-deps',
      'load-data',
      'analyze-data',
    ]);

    // 4. Verify operations can be used for history reconstruction
    expect(operations).toEqual([
      { op: 'insert', cellId: 'import-deps', index: 0 },
      { op: 'insert', cellId: 'load-data', index: 1 },
      { op: 'insert', cellId: 'analyze-data', index: 2 },
      { op: 'update', cellId: 'load-data', index: 1 },
    ]);
  });

  it('should support finding cells by ID after insertions', async () => {
    // Create some cells
    await client.writeCell(testNotebookPath, -1, 'cell 1', 'code', 'first');
    await client.writeCell(testNotebookPath, -1, 'cell 2', 'code', 'second');
    await client.writeCell(testNotebookPath, -1, 'cell 3', 'code', 'third');

    // Verify we can find by ID regardless of position
    const first = await client.readCell(testNotebookPath, { cellId: 'first' });
    const second = await client.readCell(testNotebookPath, { cellId: 'second' });
    const third = await client.readCell(testNotebookPath, { cellId: 'third' });

    expect(first.data?.cellIndex).toBe(0);
    expect(second.data?.cellIndex).toBe(1);
    expect(third.data?.cellIndex).toBe(2);

    // Now if cells were reordered, IDs would still work
    // (Nebula doesn't have a move API via REST yet, but IDs would be stable)
  });
});
