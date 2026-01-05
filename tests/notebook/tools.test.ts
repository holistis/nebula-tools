/**
 * Tests for Notebook Tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readNotebookCells,
  writeNotebookCell,
  executeCell,
  searchNotebookCells,
  readCellsToolDefinition,
  writeCellToolDefinition,
  executeCellToolDefinition,
  searchCellsToolDefinition,
} from '../../src/notebook/tools.js';
import { NebulaClient } from '../../src/notebook/client.js';

// Create a mock client
function createMockClient(): NebulaClient {
  return {
    readNotebook: vi.fn(),
    writeNotebook: vi.fn(),
    executeCode: vi.fn(),
    listKernels: vi.fn(),
    startKernel: vi.fn(),
    interruptKernel: vi.fn(),
    shutdownKernel: vi.fn(),
    listFiles: vi.fn(),
    generateCode: vi.fn(),
    chat: vi.fn(),
  } as unknown as NebulaClient;
}

describe('readNotebookCells', () => {
  let mockClient: NebulaClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should read all cells from notebook', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'print(1)', outputs: [] },
          { id: 'cell-2', type: 'markdown', content: '# Title', outputs: [] },
          { id: 'cell-3', type: 'code', content: 'print(2)', outputs: [] },
        ],
      },
    });

    const result = await readNotebookCells(
      { notebookPath: '/test.ipynb' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells).toHaveLength(3);
    expect(result.data?.totalCells).toBe(3);
  });

  it('should read specific cell indices', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'print(1)', outputs: [] },
          { id: 'cell-2', type: 'markdown', content: '# Title', outputs: [] },
          { id: 'cell-3', type: 'code', content: 'print(2)', outputs: [] },
        ],
      },
    });

    const result = await readNotebookCells(
      { notebookPath: '/test.ipynb', cellIndices: [0, 2] },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells).toHaveLength(2);
    expect(result.data?.cells[0].id).toBe('cell-1');
    expect(result.data?.cells[1].id).toBe('cell-3');
  });

  it('should filter out invalid cell indices', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'print(1)', outputs: [] },
        ],
      },
    });

    const result = await readNotebookCells(
      { notebookPath: '/test.ipynb', cellIndices: [-1, 0, 5, 100] },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells).toHaveLength(1);
  });

  it('should exclude outputs by default', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'print(1)', outputs: [{ type: 'stdout', content: '1' }] },
        ],
      },
    });

    const result = await readNotebookCells(
      { notebookPath: '/test.ipynb' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells[0].outputs).toBeUndefined();
  });

  it('should include outputs when requested', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'print(1)', outputs: [{ type: 'stdout', content: '1' }] },
        ],
      },
    });

    const result = await readNotebookCells(
      { notebookPath: '/test.ipynb', includeOutputs: true },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells[0].outputs).toHaveLength(1);
  });

  it('should handle read errors', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: false,
      error: 'File not found',
    });

    const result = await readNotebookCells(
      { notebookPath: '/nonexistent.ipynb' },
      mockClient
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('File not found');
  });
});

describe('writeNotebookCell', () => {
  let mockClient: NebulaClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should update existing cell', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'old content', outputs: [] },
        ],
      },
    });
    (mockClient.writeNotebook as any).mockResolvedValueOnce({ success: true });

    const result = await writeNotebookCell(
      { notebookPath: '/test.ipynb', cellIndex: 0, content: 'new content' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cellIndex).toBe(0);
    expect(result.data?.totalCells).toBe(1);

    // Verify the notebook was written with updated content
    const writeCall = (mockClient.writeNotebook as any).mock.calls[0][0];
    expect(writeCall.cells[0].content).toBe('new content');
  });

  it('should append new cell with index -1', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'existing', outputs: [] },
        ],
      },
    });
    (mockClient.writeNotebook as any).mockResolvedValueOnce({ success: true });

    const result = await writeNotebookCell(
      { notebookPath: '/test.ipynb', cellIndex: -1, content: 'new cell' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cellIndex).toBe(1); // New cell at index 1
    expect(result.data?.totalCells).toBe(2);

    const writeCall = (mockClient.writeNotebook as any).mock.calls[0][0];
    expect(writeCall.cells).toHaveLength(2);
    expect(writeCall.cells[1].content).toBe('new cell');
  });

  it('should set cell type', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'old', outputs: [] },
        ],
      },
    });
    (mockClient.writeNotebook as any).mockResolvedValueOnce({ success: true });

    const result = await writeNotebookCell(
      { notebookPath: '/test.ipynb', cellIndex: 0, content: '# Header', cellType: 'markdown' },
      mockClient
    );

    expect(result.success).toBe(true);
    const writeCall = (mockClient.writeNotebook as any).mock.calls[0][0];
    expect(writeCall.cells[0].type).toBe('markdown');
  });

  it('should reject invalid cell index', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [{ id: 'cell-1', type: 'code', content: 'x', outputs: [] }],
      },
    });

    const result = await writeNotebookCell(
      { notebookPath: '/test.ipynb', cellIndex: 5, content: 'x' },
      mockClient
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid cell index');
  });

  it('should handle write errors', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: { path: '/test.ipynb', cells: [{ id: 'cell-1', type: 'code', content: 'x', outputs: [] }] },
    });
    (mockClient.writeNotebook as any).mockResolvedValueOnce({
      success: false,
      error: 'Permission denied',
    });

    const result = await writeNotebookCell(
      { notebookPath: '/test.ipynb', cellIndex: 0, content: 'x' },
      mockClient
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Permission denied');
  });
});

describe('executeCell', () => {
  let mockClient: NebulaClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should execute code and return outputs', async () => {
    (mockClient.executeCode as any).mockResolvedValueOnce({
      success: true,
      data: {
        outputs: [
          { type: 'stdout', content: 'Hello World' },
        ],
        success: true,
      },
    });

    const result = await executeCell(
      { sessionId: 'session-123', code: 'print("Hello World")' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.outputs).toHaveLength(1);
    expect(result.data?.success).toBe(true);
  });

  it('should handle execution errors', async () => {
    (mockClient.executeCode as any).mockResolvedValueOnce({
      success: true,
      data: {
        outputs: [{ type: 'error', content: 'NameError: name x is not defined' }],
        success: false,
        error: 'Execution failed',
      },
    });

    const result = await executeCell(
      { sessionId: 'session-123', code: 'print(x)' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.success).toBe(false);
    expect(result.data?.error).toBe('Execution failed');
  });

  it('should handle client errors', async () => {
    (mockClient.executeCode as any).mockResolvedValueOnce({
      success: false,
      error: 'Session not found',
    });

    const result = await executeCell(
      { sessionId: 'invalid-session', code: 'print(1)' },
      mockClient
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Session not found');
  });
});

describe('searchNotebookCells', () => {
  let mockClient: NebulaClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should search cells by keyword', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'import pandas as pd', outputs: [] },
          { id: 'cell-2', type: 'code', content: 'df = pd.DataFrame()', outputs: [] },
          { id: 'cell-3', type: 'code', content: 'import numpy as np', outputs: [] },
        ],
      },
    });

    const result = await searchNotebookCells(
      { notebookPath: '/test.ipynb', query: 'pandas' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells.length).toBeGreaterThan(0);
    // Cells with 'pandas' should be returned
    expect(result.data?.cells.some(c => c.content.includes('pandas'))).toBe(true);
  });

  it('should rank cells by relevance', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'x = 1', outputs: [] },
          { id: 'cell-2', type: 'code', content: 'pandas pandas pandas', outputs: [] },
          { id: 'cell-3', type: 'code', content: 'import pandas', outputs: [] },
        ],
      },
    });

    const result = await searchNotebookCells(
      { notebookPath: '/test.ipynb', query: 'pandas' },
      mockClient
    );

    expect(result.success).toBe(true);
    // Cell with more occurrences should rank higher
    expect(result.data?.cells[0].content).toContain('pandas');
    expect(result.data?.cells[0].score).toBeGreaterThan(result.data?.cells[1]?.score || 0);
  });

  it('should respect limit parameter', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: Array.from({ length: 10 }, (_, i) => ({
          id: `cell-${i}`,
          type: 'code',
          content: `pandas code ${i}`,
          outputs: [],
        })),
      },
    });

    const result = await searchNotebookCells(
      { notebookPath: '/test.ipynb', query: 'pandas', limit: 3 },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells.length).toBe(3);
    expect(result.data?.totalCells).toBe(10);
  });

  it('should include cell indices', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'x = 1', outputs: [] },
          { id: 'cell-2', type: 'code', content: 'pandas code', outputs: [] },
        ],
      },
    });

    const result = await searchNotebookCells(
      { notebookPath: '/test.ipynb', query: 'pandas' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells[0].index).toBe(1); // Second cell matches
  });

  it('should search in outputs when included', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          {
            id: 'cell-1',
            type: 'code',
            content: 'print(df)',
            outputs: [{ type: 'stdout', content: 'pandas DataFrame with 100 rows' }],
          },
        ],
      },
    });

    const result = await searchNotebookCells(
      { notebookPath: '/test.ipynb', query: 'pandas', includeOutputs: true },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells).toHaveLength(1);
  });

  it('should return empty for no matches', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'x = 1', outputs: [] },
        ],
      },
    });

    const result = await searchNotebookCells(
      { notebookPath: '/test.ipynb', query: 'nonexistent_term_xyz' },
      mockClient
    );

    expect(result.success).toBe(true);
    expect(result.data?.cells).toHaveLength(0);
  });

  it('should boost exact phrase matches', async () => {
    (mockClient.readNotebook as any).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/test.ipynb',
        cells: [
          { id: 'cell-1', type: 'code', content: 'pandas dataframe', outputs: [] },
          { id: 'cell-2', type: 'code', content: 'pandas and also dataframe', outputs: [] },
        ],
      },
    });

    const result = await searchNotebookCells(
      { notebookPath: '/test.ipynb', query: 'pandas dataframe' },
      mockClient
    );

    expect(result.success).toBe(true);
    // Exact phrase match should score higher
    expect(result.data?.cells[0].content).toBe('pandas dataframe');
  });
});

describe('Tool Definitions', () => {
  it('readCellsToolDefinition should have correct structure', () => {
    expect(readCellsToolDefinition.name).toBe('notebook_read_cells');
    expect(readCellsToolDefinition.parameters.required).toContain('notebookPath');
    expect(readCellsToolDefinition.parameters.properties.cellIndices).toBeDefined();
    expect(readCellsToolDefinition.parameters.properties.includeOutputs).toBeDefined();
  });

  it('writeCellToolDefinition should have correct structure', () => {
    expect(writeCellToolDefinition.name).toBe('notebook_write_cell');
    expect(writeCellToolDefinition.parameters.required).toContain('notebookPath');
    expect(writeCellToolDefinition.parameters.required).toContain('cellIndex');
    expect(writeCellToolDefinition.parameters.required).toContain('content');
  });

  it('executeCellToolDefinition should have correct structure', () => {
    expect(executeCellToolDefinition.name).toBe('notebook_execute');
    expect(executeCellToolDefinition.parameters.required).toContain('sessionId');
    expect(executeCellToolDefinition.parameters.required).toContain('code');
  });

  it('searchCellsToolDefinition should have correct structure', () => {
    expect(searchCellsToolDefinition.name).toBe('notebook_search');
    expect(searchCellsToolDefinition.parameters.required).toContain('notebookPath');
    expect(searchCellsToolDefinition.parameters.required).toContain('query');
    expect(searchCellsToolDefinition.parameters.properties.limit).toBeDefined();
  });
});
