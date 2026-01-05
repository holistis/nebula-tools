/**
 * Tests for archived shell execution tool
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { executeShell, shell } from '../../src/_archived/shell/execute.js';

describe('Shell Tools', () => {
  describe('executeShell', () => {
    it('should execute simple command', async () => {
      const result = await executeShell({ command: 'echo "Hello, World!"' });

      expect(result.success).toBe(true);
      expect(result.data?.stdout.trim()).toBe('Hello, World!');
      expect(result.data?.exitCode).toBe(0);
      expect(result.data?.timedOut).toBe(false);
    });

    it('should capture stderr', async () => {
      const result = await executeShell({ command: 'echo "error" >&2' });

      expect(result.success).toBe(true);
      expect(result.data?.stderr.trim()).toBe('error');
    });

    it('should return exit code for failed commands', async () => {
      const result = await executeShell({ command: 'exit 42' });

      expect(result.success).toBe(true);
      expect(result.data?.exitCode).toBe(42);
    });

    it('should use specified working directory', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'nebula-shell-'));
      try {
        const result = await executeShell({
          command: 'pwd',
          cwd: tempDir,
        });

        expect(result.success).toBe(true);
        expect(result.data?.stdout.trim()).toContain(tempDir.split('/').pop());
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should pass environment variables', async () => {
      const result = await executeShell({
        command: 'echo $MY_VAR',
        env: { MY_VAR: 'test_value' },
      });

      expect(result.success).toBe(true);
      expect(result.data?.stdout.trim()).toBe('test_value');
    });

    it('should timeout long-running commands', async () => {
      const result = await executeShell({
        command: 'sleep 10',
        timeout: 100,
      });

      expect(result.success).toBe(true);
      expect(result.data?.timedOut).toBe(true);
    }, 5000);

    it('should include process ID', async () => {
      const result = await executeShell({ command: 'echo test' });

      expect(result.success).toBe(true);
      expect(result.data?.pid).toBeDefined();
      expect(typeof result.data?.pid).toBe('number');
    });
  });

  describe('shell (simple API)', () => {
    it('should return output on success', async () => {
      const result = await shell('echo "success"');

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
    });

    it('should fail for non-zero exit code', async () => {
      const result = await shell('exit 1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('exit code 1');
    });

    it('should fail on timeout', async () => {
      const result = await shell('sleep 10', { timeout: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 5000);

    it('should combine stdout and stderr', async () => {
      const result = await shell('echo "out"; echo "err" >&2');

      expect(result.success).toBe(true);
      expect(result.data).toContain('out');
      expect(result.data).toContain('err');
    });

    it('should use cwd option', async () => {
      const result = await shell('pwd', { cwd: '/tmp' });

      expect(result.success).toBe(true);
      // On macOS, /tmp might resolve to /private/tmp
      expect(result.data).toMatch(/\/?tmp$/);
    });
  });

  describe('complex commands', () => {
    it('should handle pipes', async () => {
      const result = await shell('echo "hello world" | grep world');

      expect(result.success).toBe(true);
      expect(result.data).toContain('hello world');
    });

    it('should handle command chaining', async () => {
      const result = await shell('echo "a" && echo "b" && echo "c"');

      expect(result.success).toBe(true);
      expect(result.data).toContain('a');
      expect(result.data).toContain('b');
      expect(result.data).toContain('c');
    });

    it('should handle variable expansion', async () => {
      const result = await shell('NAME=test; echo "Hello, $NAME"');

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello, test');
    });

    it('should handle process substitution', async () => {
      const result = await shell('cat <(echo "process sub")');

      expect(result.success).toBe(true);
      expect(result.data).toBe('process sub');
    });
  });
});
