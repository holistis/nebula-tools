#!/usr/bin/env node
/**
 * Standalone test runner for Nebula MCP Server
 * Runs comprehensive tests without requiring vitest
 */

import { NebulaClient } from './dist/notebook/client.js';
import { handleKernelTool } from './dist/mcp/tools/kernel.js';
import { handleNotebookTool } from './dist/mcp/tools/notebook.js';
import { handleExecutionTool } from './dist/mcp/tools/execution.js';
import { handleFileTool } from './dist/mcp/tools/files.js';

const TEST_NOTEBOOK_PATH = '/tmp/test-notebook.ipynb';
const TEST_FILE_PATH = '/tmp/test-file.txt';

let passed = 0;
let failed = 0;
let skipped = 0;

function log(msg) {
  console.log(msg);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    log(`  ✗ ${name}`);
    log(`    Error: ${error.message}`);
  }
}

async function skip(name, reason) {
  skipped++;
  log(`  ○ ${name} (skipped: ${reason})`);
}

// ===========================================================================
// Main Test Suite
// ===========================================================================

async function runTests() {
  const client = new NebulaClient({ baseUrl: 'http://localhost:8000' });

  log('\n========================================');
  log('Nebula MCP Server - Comprehensive Tests');
  log('========================================\n');

  // ===========================================================================
  // Kernel Tests
  // ===========================================================================
  log('Kernel Operations:');

  let sessionId;

  await test('list available kernels', async () => {
    const result = await client.listKernels();
    assert(result.success, 'Should succeed');
    assert(Array.isArray(result.data), 'Should return array');
    assert(result.data.length > 0, 'Should have kernels');
    assert(result.data.some(k => k.includes('python')), 'Should have python kernel');
  });

  await test('list sessions', async () => {
    const result = await client.listSessions();
    assert(result.success, 'Should succeed');
    assert(Array.isArray(result.data), 'Should return array');
  });

  await test('start kernel session', async () => {
    const result = await client.startKernel('python3');
    assert(result.success, 'Should succeed');
    assert(result.data.sessionId, 'Should have session ID');
    sessionId = result.data.sessionId;
  });

  await test('execute code - print', async () => {
    const result = await client.executeCodeStreaming(sessionId, 'print("Hello, World!")', 30000);
    assert(result.success, 'Should succeed');
    assert(result.data.outputs.length > 0, 'Should have outputs');
    assert(result.data.outputs.some(o => o.content.includes('Hello, World!')), 'Should contain output');
  });

  await test('execute code - computation', async () => {
    const result = await client.executeCodeStreaming(sessionId, '2 + 2', 30000);
    assert(result.success, 'Should succeed');
    assert(result.data.outputs.some(o => o.content.includes('4')), 'Should return 4');
  });

  await test('execute code - variable persistence', async () => {
    await client.executeCodeStreaming(sessionId, 'test_var = 42', 30000);
    const result = await client.executeCodeStreaming(sessionId, 'print(test_var)', 30000);
    assert(result.success, 'Should succeed');
    assert(result.data.outputs.some(o => o.content.includes('42')), 'Variable should persist');
  });

  await test('execute code - error handling', async () => {
    const result = await client.executeCodeStreaming(sessionId, 'raise ValueError("test")', 30000);
    assert(result.data.outputs.some(o => o.type === 'error' || o.content.includes('ValueError')), 'Should capture error');
  });

  await test('restart kernel', async () => {
    const result = await client.restartKernel(sessionId);
    assert(result.success, 'Should succeed');
    // Wait for restart
    await new Promise(r => setTimeout(r, 2000));
  });

  await test('shutdown kernel', async () => {
    const result = await client.shutdownKernel(sessionId);
    assert(result.success, 'Should succeed');
  });

  // ===========================================================================
  // Notebook Tests
  // ===========================================================================
  log('\nNotebook Operations:');

  // Create test notebook
  const testNotebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { language_info: { name: 'python' } },
    cells: [
      { cell_type: 'markdown', source: '# Test Notebook', metadata: {} },
      { cell_type: 'code', source: 'import pandas as pd\nprint("cell 1")', metadata: {}, outputs: [], execution_count: null },
      { cell_type: 'code', source: 'x = 10\nprint(x)', metadata: {}, outputs: [{ output_type: 'stream', name: 'stdout', text: '10\n' }], execution_count: 1 },
      { cell_type: 'markdown', source: '## Analysis Section', metadata: {} },
      { cell_type: 'code', source: 'def add(a, b):\n    return a + b', metadata: {}, outputs: [], execution_count: null },
    ],
  };
  await client.writeFile(TEST_NOTEBOOK_PATH, JSON.stringify(testNotebook, null, 2));

  await test('read notebook', async () => {
    const result = await client.readNotebook(TEST_NOTEBOOK_PATH);
    assert(result.success, 'Should succeed');
    assert(result.data.cells.length === 5, 'Should have 5 cells');
  });

  await test('read notebook - cell types', async () => {
    const result = await client.readNotebook(TEST_NOTEBOOK_PATH);
    assert(result.data.cells[0].type === 'markdown', 'Cell 0 should be markdown');
    assert(result.data.cells[1].type === 'code', 'Cell 1 should be code');
  });

  await test('read notebook - cell outputs', async () => {
    const result = await client.readNotebook(TEST_NOTEBOOK_PATH);
    assert(result.data.cells[2].outputs.length > 0, 'Cell 2 should have outputs');
    assert(result.data.cells[2].outputs[0].content.includes('10'), 'Output should contain 10');
  });

  await test('write cell - append', async () => {
    const result = await client.writeCell(TEST_NOTEBOOK_PATH, -1, 'print("new cell")', 'code');
    assert(result.success, 'Should succeed');
    assert(result.data.cellIndex === 5, 'Should be at index 5');
    assert(result.data.totalCells === 6, 'Should have 6 cells');
  });

  await test('write cell - update', async () => {
    const result = await client.writeCell(TEST_NOTEBOOK_PATH, 1, 'print("updated")', 'code');
    assert(result.success, 'Should succeed');
    const read = await client.readNotebook(TEST_NOTEBOOK_PATH);
    assert(read.data.cells[1].content === 'print("updated")', 'Cell should be updated');
  });

  await test('delete cell', async () => {
    const result = await client.deleteCell(TEST_NOTEBOOK_PATH, 5);
    assert(result.success, 'Should succeed');
    assert(result.data.totalCells === 5, 'Should have 5 cells');
  });

  await test('search cells', async () => {
    // Search for 'add' which is in the function definition cell (not modified by previous tests)
    const result = await client.searchCells(TEST_NOTEBOOK_PATH, 'add', 5);
    assert(result.success, 'Should succeed');
    assert(result.data.cells.length > 0, 'Should find cells');
  });

  await test('search cells - no results', async () => {
    const result = await client.searchCells(TEST_NOTEBOOK_PATH, 'xyznonexistent123', 5);
    assert(result.success, 'Should succeed');
    assert(result.data.cells.length === 0, 'Should find no cells');
  });

  await test('read notebook - non-existent', async () => {
    const result = await client.readNotebook('/tmp/nonexistent-12345.ipynb');
    assert(!result.success, 'Should fail');
  });

  await test('write cell - invalid index', async () => {
    const result = await client.writeCell(TEST_NOTEBOOK_PATH, 999, 'test', 'code');
    assert(!result.success, 'Should fail');
    assert(result.error.includes('out of range'), 'Error should mention out of range');
  });

  // ===========================================================================
  // File Tests
  // ===========================================================================
  log('\nFile Operations:');

  await test('list files', async () => {
    const result = await client.listFiles('/tmp');
    assert(result.success, 'Should succeed');
    assert(Array.isArray(result.data), 'Should return array');
  });

  await test('write file', async () => {
    const result = await client.writeFile(TEST_FILE_PATH, 'Line 1\nLine 2\nLine 3');
    assert(result.success, 'Should succeed');
  });

  await test('read file', async () => {
    const result = await client.readFile(TEST_FILE_PATH);
    assert(result.success, 'Should succeed');
    assert(result.data.content.includes('Line 1'), 'Should contain content');
  });

  await test('read file - non-existent', async () => {
    const result = await client.readFile('/tmp/nonexistent-file-12345.txt');
    assert(!result.success, 'Should fail');
  });

  // ===========================================================================
  // MCP Tool Handler Tests
  // ===========================================================================
  log('\nMCP Tool Handlers:');

  await test('handleKernelTool - list_kernels', async () => {
    const result = await handleKernelTool('list_kernels', {}, client);
    assert(!result.isError, 'Should succeed');
    assert(result.content[0].text.includes('kernels'), 'Should list kernels');
  });

  await test('handleNotebookTool - read_notebook brief', async () => {
    const result = await handleNotebookTool('read_notebook', { path: TEST_NOTEBOOK_PATH, format: 'brief' }, client);
    assert(!result.isError, 'Should succeed');
    assert(result.content[0].text.includes('Notebook:'), 'Should contain notebook info');
  });

  await test('handleNotebookTool - read_notebook detailed', async () => {
    const result = await handleNotebookTool('read_notebook', { path: TEST_NOTEBOOK_PATH, format: 'detailed' }, client);
    assert(!result.isError, 'Should succeed');
    assert(result.content[0].text.includes('Cell 0'), 'Should contain cell info');
  });

  await test('handleNotebookTool - search_cells', async () => {
    const result = await handleNotebookTool('search_cells', { path: TEST_NOTEBOOK_PATH, query: 'print' }, client);
    assert(!result.isError, 'Should succeed');
  });

  await test('handleFileTool - list_files', async () => {
    const result = await handleFileTool('list_files', { path: '/tmp' }, client);
    assert(!result.isError, 'Should succeed');
    assert(result.content[0].text.includes('Contents of'), 'Should list contents');
  });

  await test('handleFileTool - write_file', async () => {
    const result = await handleFileTool('write_file', { path: '/tmp/mcp-test.txt', content: 'test content' }, client);
    assert(!result.isError, 'Should succeed');
    assert(result.content[0].text.includes('Wrote'), 'Should confirm write');
  });

  await test('handleFileTool - read_file', async () => {
    const result = await handleFileTool('read_file', { path: '/tmp/mcp-test.txt' }, client);
    assert(!result.isError, 'Should succeed');
    assert(result.content[0].text.includes('test content'), 'Should contain content');
  });

  // ===========================================================================
  // Execution Tool Handler Tests (need fresh kernel)
  // ===========================================================================
  log('\nExecution Tool Handlers:');

  const execKernel = await client.startKernel('python3');
  const execSessionId = execKernel.data.sessionId;

  await test('handleExecutionTool - execute_code', async () => {
    const result = await handleExecutionTool('execute_code', {
      session_id: execSessionId,
      code: 'print("MCP execution test")',
      timeout: 30,
    }, client);
    assert(!result.isError, 'Should succeed');
    const hasOutput = result.content.some(c => c.type === 'text' && c.text.includes('MCP execution test'));
    assert(hasOutput, 'Should contain output');
  });

  await test('handleExecutionTool - execute_code computation', async () => {
    const result = await handleExecutionTool('execute_code', {
      session_id: execSessionId,
      code: 'sum(range(10))',
      timeout: 30,
    }, client);
    assert(!result.isError, 'Should succeed');
    const hasOutput = result.content.some(c => c.type === 'text' && c.text.includes('45'));
    assert(hasOutput, 'Should return 45');
  });

  await test('handleExecutionTool - execute_code no output', async () => {
    const result = await handleExecutionTool('execute_code', {
      session_id: execSessionId,
      code: 'x = 10',
      timeout: 30,
    }, client);
    assert(!result.isError, 'Should succeed');
    assert(result.content[0].text.includes('no output'), 'Should indicate no output');
  });

  // Create notebook for execute_cell test
  await client.writeFile('/tmp/exec-test.ipynb', JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [{ cell_type: 'code', source: 'print("executed!")', metadata: {}, outputs: [] }],
  }, null, 2));

  await test('handleExecutionTool - execute_cell', async () => {
    const result = await handleExecutionTool('execute_cell', {
      path: '/tmp/exec-test.ipynb',
      cell_index: 0,
      session_id: execSessionId,
      timeout: 30,
    }, client);
    assert(!result.isError, 'Should succeed');
    const hasOutput = result.content.some(c => c.type === 'text' && c.text.includes('executed!'));
    assert(hasOutput, 'Should contain output');
  });

  await test('handleExecutionTool - execute_cell invalid index', async () => {
    const result = await handleExecutionTool('execute_cell', {
      path: '/tmp/exec-test.ipynb',
      cell_index: 999,
      session_id: execSessionId,
      timeout: 30,
    }, client);
    assert(result.isError, 'Should fail');
  });

  // Cleanup
  await client.shutdownKernel(execSessionId);

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================
  log('\nError Handling:');

  await test('handle unknown kernel tool', async () => {
    const result = await handleKernelTool('unknown_tool', {}, client);
    assert(result.isError, 'Should fail');
    assert(result.content[0].text.includes('Unknown'), 'Should indicate unknown tool');
  });

  await test('handle unknown notebook tool', async () => {
    const result = await handleNotebookTool('unknown_tool', {}, client);
    assert(result.isError, 'Should fail');
  });

  await test('handle unknown file tool', async () => {
    const result = await handleFileTool('unknown_tool', {}, client);
    assert(result.isError, 'Should fail');
  });

  await test('handle unknown execution tool', async () => {
    const result = await handleExecutionTool('unknown_tool', {}, client);
    assert(result.isError, 'Should fail');
  });

  // ===========================================================================
  // Summary
  // ===========================================================================
  log('\n========================================');
  log('Test Summary');
  log('========================================');
  log(`  Passed:  ${passed}`);
  log(`  Failed:  ${failed}`);
  log(`  Skipped: ${skipped}`);
  log(`  Total:   ${passed + failed + skipped}`);
  log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
