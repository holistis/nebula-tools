/**
 * Tests for Cell ID stability and metadata updates via operation router.
 *
 * Requires a running Nebula server at http://localhost:8000
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NebulaClient } from '../notebook/client.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Cell ID Tracking (operation router)', () => {
  let client: NebulaClient;
  let testNotebookPath: string;

  beforeEach(() => {
    client = new NebulaClient({ baseUrl: 'http://localhost:8000' });
    testNotebookPath = path.join(
      '/tmp',
      `nebula-test-${Date.now()}-${Math.random().toString(16).slice(2)}.ipynb`
    );

    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { name: 'python3' } },
      cells: [
        {
          id: 'existing-cell-1',
          cell_type: 'code',
          source: 'print("Cell 1")',
          metadata: {},
          outputs: [],
          execution_count: null,
        },
        {
          id: 'existing-cell-2',
          cell_type: 'code',
          source: 'print("Cell 2")',
          metadata: {},
          outputs: [],
          execution_count: null,
        },
      ],
    };
    fs.writeFileSync(testNotebookPath, JSON.stringify(notebook, null, 2));
  });

  afterEach(() => {
    if (fs.existsSync(testNotebookPath)) {
      fs.unlinkSync(testNotebookPath);
    }
  });

  it('should create a cell with specified ID', async () => {
    const result = await client.insertCellOp(testNotebookPath, -1, {
      id: 'my-new-cell',
      type: 'code',
      content: 'print("New cell")',
    });

    expect(result.success).toBe(true);

    const notebook = await client.readNotebookViaRouter(testNotebookPath);
    expect(notebook.success).toBe(true);
    const ids = notebook.data?.cells.map(c => c.id) || [];
    expect(ids).toContain('my-new-cell');
  }, 15000);

  it('should avoid duplicate IDs on insert', async () => {
    const result = await client.insertCellOp(testNotebookPath, -1, {
      id: 'existing-cell-1',
      type: 'code',
      content: 'print("Duplicate ID")',
    });

    expect(result.success).toBe(true);

    const notebook = await client.readNotebookViaRouter(testNotebookPath);
    expect(notebook.success).toBe(true);
    const ids = notebook.data?.cells.map(c => c.id) || [];
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('should read a cell by ID', async () => {
    const result = await client.readCellOp(testNotebookPath, { cellId: 'existing-cell-2' });
    expect(result.success).toBe(true);
    expect(result.data?.cell.id).toBe('existing-cell-2');
    expect(result.data?.cell.content).toContain('Cell 2');
  });

  it('should preserve ID after content update', async () => {
    const update = await client.updateContentOp(testNotebookPath, 'existing-cell-1', 'print("Updated content")');
    expect(update.success).toBe(true);

    const read = await client.readCellOp(testNotebookPath, { cellId: 'existing-cell-1' });
    expect(read.success).toBe(true);
    expect(read.data?.cell.id).toBe('existing-cell-1');
    expect(read.data?.cell.content).toContain('Updated content');
  });

  it('should update cell type via metadata', async () => {
    const meta = await client.updateMetadataOp(testNotebookPath, 'existing-cell-1', { type: 'markdown' });
    expect(meta.success).toBe(true);

    const read = await client.readCellOp(testNotebookPath, { cellId: 'existing-cell-1' });
    expect(read.success).toBe(true);
    expect(read.data?.cell.type).toBe('markdown');
  });
});
