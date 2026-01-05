/**
 * Tests for archived file tools (fs, glob, grep)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  readFileContent,
  writeFileContent,
  editFile,
  listDirectory,
} from '../../src/_archived/file/fs.js';
import { findFiles } from '../../src/_archived/file/glob.js';
import { grep } from '../../src/_archived/file/grep.js';

describe('File Tools', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory for tests
    tempDir = await mkdtemp(join(tmpdir(), 'nebula-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readFileContent', () => {
    it('should read entire file', async () => {
      const testFile = join(tempDir, 'test.txt');
      await writeFile(testFile, 'line 1\nline 2\nline 3');

      const result = await readFileContent({ path: testFile });

      expect(result.success).toBe(true);
      expect(result.data?.content).toBe('line 1\nline 2\nline 3');
      expect(result.data?.lineCount).toBe(3);
      expect(result.data?.truncated).toBe(false);
    });

    it('should read specific line range', async () => {
      const testFile = join(tempDir, 'test.txt');
      await writeFile(testFile, 'line 1\nline 2\nline 3\nline 4\nline 5');

      const result = await readFileContent({
        path: testFile,
        startLine: 2,
        endLine: 4,
      });

      expect(result.success).toBe(true);
      expect(result.data?.content).toBe('line 2\nline 3\nline 4');
      expect(result.data?.truncated).toBe(true);
    });

    it('should handle file not found', async () => {
      const result = await readFileContent({ path: '/nonexistent/file.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should use cwd option correctly', async () => {
      const testFile = join(tempDir, 'subdir', 'test.txt');
      await mkdir(join(tempDir, 'subdir'), { recursive: true });
      await writeFile(testFile, 'content');

      const result = await readFileContent(
        { path: 'subdir/test.txt' },
        { cwd: tempDir }
      );

      expect(result.success).toBe(true);
      expect(result.data?.content).toBe('content');
    });
  });

  describe('writeFileContent', () => {
    it('should write file content', async () => {
      const testFile = join(tempDir, 'output.txt');

      const result = await writeFileContent({
        path: testFile,
        content: 'Hello, World!',
      });

      expect(result.success).toBe(true);
      expect(result.data?.bytesWritten).toBe(13);

      // Verify file was written
      const readResult = await readFileContent({ path: testFile });
      expect(readResult.data?.content).toBe('Hello, World!');
    });

    it('should create parent directories', async () => {
      const testFile = join(tempDir, 'deep', 'nested', 'output.txt');

      const result = await writeFileContent({
        path: testFile,
        content: 'nested content',
      });

      expect(result.success).toBe(true);

      const readResult = await readFileContent({ path: testFile });
      expect(readResult.data?.content).toBe('nested content');
    });

    it('should overwrite existing file', async () => {
      const testFile = join(tempDir, 'existing.txt');
      await writeFile(testFile, 'original content');

      const result = await writeFileContent({
        path: testFile,
        content: 'new content',
      });

      expect(result.success).toBe(true);

      const readResult = await readFileContent({ path: testFile });
      expect(readResult.data?.content).toBe('new content');
    });
  });

  describe('editFile', () => {
    it('should replace string in file', async () => {
      const testFile = join(tempDir, 'edit.txt');
      await writeFile(testFile, 'Hello, World!');

      const result = await editFile({
        path: testFile,
        oldString: 'World',
        newString: 'Universe',
      });

      expect(result.success).toBe(true);
      expect(result.data?.replacements).toBe(1);

      const readResult = await readFileContent({ path: testFile });
      expect(readResult.data?.content).toBe('Hello, Universe!');
    });

    it('should fail if string not found', async () => {
      const testFile = join(tempDir, 'edit.txt');
      await writeFile(testFile, 'Hello, World!');

      const result = await editFile({
        path: testFile,
        oldString: 'NotFound',
        newString: 'Replacement',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail if occurrence count mismatches', async () => {
      const testFile = join(tempDir, 'edit.txt');
      await writeFile(testFile, 'foo foo foo');

      const result = await editFile({
        path: testFile,
        oldString: 'foo',
        newString: 'bar',
        expectedReplacements: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected 1');
      expect(result.error).toContain('found 3');
    });

    it('should replace multiple occurrences when expectedReplacements matches', async () => {
      const testFile = join(tempDir, 'edit.txt');
      await writeFile(testFile, 'foo foo foo');

      const result = await editFile({
        path: testFile,
        oldString: 'foo',
        newString: 'bar',
        expectedReplacements: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data?.replacements).toBe(3);

      const readResult = await readFileContent({ path: testFile });
      expect(readResult.data?.content).toBe('bar bar bar');
    });
  });

  describe('listDirectory', () => {
    it('should list directory contents', async () => {
      // Create some files and directories
      await writeFile(join(tempDir, 'file1.txt'), 'content');
      await writeFile(join(tempDir, 'file2.js'), 'content');
      await mkdir(join(tempDir, 'subdir'));

      const result = await listDirectory({ path: tempDir });

      expect(result.success).toBe(true);
      expect(result.data?.entries.length).toBe(3);

      // Directories should come first
      expect(result.data?.entries[0].name).toBe('subdir');
      expect(result.data?.entries[0].type).toBe('directory');
    });

    it('should include stats when requested', async () => {
      await writeFile(join(tempDir, 'file.txt'), 'content');

      const result = await listDirectory({ path: tempDir, includeStats: true });

      expect(result.success).toBe(true);
      expect(result.data?.entries[0].size).toBeDefined();
      expect(result.data?.entries[0].mtimeMs).toBeDefined();
    });

    it('should handle non-existent directory', async () => {
      const result = await listDirectory({ path: '/nonexistent/dir' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});

describe('Glob Tool', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nebula-glob-'));

    // Create test file structure
    await writeFile(join(tempDir, 'file1.ts'), 'ts content');
    await writeFile(join(tempDir, 'file2.ts'), 'ts content');
    await writeFile(join(tempDir, 'file3.js'), 'js content');
    await mkdir(join(tempDir, 'src'));
    await writeFile(join(tempDir, 'src', 'app.ts'), 'app content');
    await writeFile(join(tempDir, 'src', 'utils.ts'), 'utils content');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should find files matching pattern', async () => {
    const result = await findFiles({ pattern: '**/*.ts' }, { cwd: tempDir });

    expect(result.success).toBe(true);
    expect(result.data?.files.length).toBe(4);
    expect(result.data?.truncated).toBe(false);
  });

  it('should respect limit parameter', async () => {
    const result = await findFiles(
      { pattern: '**/*.ts', limit: 2 },
      { cwd: tempDir }
    );

    expect(result.success).toBe(true);
    expect(result.data?.files.length).toBe(2);
    expect(result.data?.totalCount).toBe(4);
    expect(result.data?.truncated).toBe(true);
  });

  it('should find files in subdirectory', async () => {
    const result = await findFiles(
      { pattern: '*.ts', path: 'src' },
      { cwd: tempDir }
    );

    expect(result.success).toBe(true);
    expect(result.data?.files.length).toBe(2);
  });

  it('should handle dotfiles option', async () => {
    await writeFile(join(tempDir, '.hidden'), 'hidden content');

    const withDot = await findFiles(
      { pattern: '*', dot: true },
      { cwd: tempDir }
    );
    const withoutDot = await findFiles(
      { pattern: '*', dot: false },
      { cwd: tempDir }
    );

    expect(withDot.data?.files.some((f) => f.relativePath === '.hidden')).toBe(true);
    expect(withoutDot.data?.files.some((f) => f.relativePath === '.hidden')).toBe(false);
  });
});

describe('Grep Tool', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nebula-grep-'));

    await writeFile(
      join(tempDir, 'file1.ts'),
      'function hello() {\n  console.log("Hello");\n}'
    );
    await writeFile(
      join(tempDir, 'file2.ts'),
      'const hello = "world";\nfunction goodbye() {}'
    );
    await writeFile(join(tempDir, 'file3.js'), 'var hello = true;');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should find matches in files', async () => {
    const result = await grep({ pattern: 'hello' }, { cwd: tempDir });

    expect(result.success).toBe(true);
    expect(result.data?.matches.length).toBeGreaterThan(0);
    expect(result.data?.totalCount).toBeGreaterThan(0);
  });

  it('should respect case insensitive option', async () => {
    const caseSensitive = await grep(
      { pattern: 'Hello', ignoreCase: false },
      { cwd: tempDir }
    );
    const caseInsensitive = await grep(
      { pattern: 'Hello', ignoreCase: true },
      { cwd: tempDir }
    );

    // Case insensitive should find more matches
    expect(caseInsensitive.data?.totalCount).toBeGreaterThanOrEqual(
      caseSensitive.data?.totalCount || 0
    );
  });

  it('should filter by file pattern', async () => {
    const tsOnly = await grep(
      { pattern: 'hello', include: '*.ts' },
      { cwd: tempDir }
    );
    const jsOnly = await grep(
      { pattern: 'hello', include: '*.js' },
      { cwd: tempDir }
    );

    // Both should find matches but in different files
    expect(tsOnly.data?.matches.every((m) => m.filePath.endsWith('.ts'))).toBe(true);
    expect(jsOnly.data?.matches.every((m) => m.filePath.endsWith('.js'))).toBe(true);
  });

  it('should handle invalid regex', async () => {
    const result = await grep({ pattern: '[invalid(' }, { cwd: tempDir });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid regex');
  });

  it('should respect limit parameter', async () => {
    const result = await grep({ pattern: 'hello', limit: 1 }, { cwd: tempDir });

    expect(result.success).toBe(true);
    expect(result.data?.matches.length).toBe(1);
    expect(result.data?.truncated).toBe(true);
  });
});
