/**
 * Shell execution tool - run shell commands
 * Simplified from Gemini CLI shell.ts, removing Config/MessageBus dependencies
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import type { ToolResult, ExecuteOptions } from '../../types.js';

export interface ShellParams {
  /** Command to execute */
  command: string;
  /** Working directory (defaults to cwd) */
  cwd?: string;
  /** Brief description of the command */
  description?: string;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Environment variables to add */
  env?: Record<string, string>;
}

export interface ShellResult {
  /** Combined stdout output */
  stdout: string;
  /** Combined stderr output */
  stderr: string;
  /** Exit code (null if killed by signal) */
  exitCode: number | null;
  /** Signal that killed the process (if any) */
  signal: string | null;
  /** Whether the command was killed due to timeout */
  timedOut: boolean;
  /** Process ID */
  pid?: number;
}

/**
 * Execute a shell command
 */
export async function executeShell(
  params: ShellParams,
  options: ExecuteOptions = {}
): Promise<ToolResult<ShellResult>> {
  const cwd = params.cwd
    ? resolve(options.cwd || process.cwd(), params.cwd)
    : (options.cwd || process.cwd());
  const timeout = params.timeout ?? options.timeout ?? 60000;

  const isWindows = platform() === 'win32';
  const shell = isWindows ? 'powershell.exe' : 'bash';
  const shellArgs = isWindows
    ? ['-NoProfile', '-Command', params.command]
    : ['-c', params.command];

  return new Promise((resolvePromise) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env, ...params.env },
      windowsHide: true,
    });

    const timeoutId = timeout > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          // Force kill after 5 seconds if not dead
          setTimeout(() => child.kill('SIGKILL'), 5000);
        }, timeout)
      : undefined;

    // Handle abort signal
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        child.kill('SIGTERM');
      }, { once: true });
    }

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolvePromise({
        success: false,
        error: `Failed to start command: ${error.message}`,
      });
    });

    child.on('close', (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);

      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      resolvePromise({
        success: true,
        data: {
          stdout,
          stderr,
          exitCode: code,
          signal: signal,
          timedOut,
          pid: child.pid,
        },
      });
    });
  });
}

/**
 * Execute command and return combined output (simpler API)
 */
export async function shell(
  command: string,
  options: ExecuteOptions & { cwd?: string; timeout?: number } = {}
): Promise<ToolResult<string>> {
  const result = await executeShell({ command, cwd: options.cwd, timeout: options.timeout }, options);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const data = result.data!;
  const output = (data.stdout + data.stderr).trim();

  if (data.timedOut) {
    return {
      success: false,
      error: `Command timed out after ${options.timeout || 60000}ms. Partial output:\n${output}`,
    };
  }

  if (data.exitCode !== 0 && data.exitCode !== null) {
    return {
      success: false,
      error: `Command failed with exit code ${data.exitCode}:\n${output}`,
      data: output, // Still include output for debugging
    };
  }

  return { success: true, data: output };
}

/**
 * Tool definition for agents
 */
export const shellToolDefinition = {
  name: 'shell',
  description: platform() === 'win32'
    ? 'Execute a PowerShell command'
    : 'Execute a bash shell command',
  parameters: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command',
      },
      description: {
        type: 'string',
        description: 'Brief description of what the command does',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 60000)',
      },
    },
    required: ['command'],
  },
};

export const executeShellToolDefinition = {
  name: 'execute_shell',
  description: 'Execute a shell command with detailed output (stdout, stderr, exit code)',
  parameters: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command',
      },
      description: {
        type: 'string',
        description: 'Brief description of what the command does',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 60000)',
      },
      env: {
        type: 'object',
        description: 'Additional environment variables',
      },
    },
    required: ['command'],
  },
};
