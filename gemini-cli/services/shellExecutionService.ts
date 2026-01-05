/**
 * Shell Execution Service stub
 * Provides basic shell execution for tools
 */

import { spawn } from 'node:child_process';
import os from 'node:os';

export interface ShellExecutionConfig {
    pager?: string;
    timeout?: number;
}

export interface ShellOutputEvent {
    type: 'data' | 'binary_detected' | 'binary_progress';
    chunk?: string;
    bytesReceived?: number;
}

export interface ShellExecutionResult {
    output: string;
    error: Error | null;
    exitCode: number | null;
    signal: string | null;
    aborted: boolean;
    pid: number;
}

export class ShellExecutionService {
    static async execute(
        command: string,
        cwd: string,
        onOutput: (event: ShellOutputEvent) => void,
        signal: AbortSignal,
        interactiveShell: boolean = false,
        _config?: ShellExecutionConfig,
    ): Promise<{ result: Promise<ShellExecutionResult>; pid: number }> {
        const isWindows = os.platform() === 'win32';
        const shell = isWindows ? 'powershell.exe' : 'bash';
        const shellArgs = isWindows ? ['-NoProfile', '-Command', command] : ['-c', command];

        const child = spawn(shell, shellArgs, {
            cwd,
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });

        const pid = child.pid || 0;

        const resultPromise = new Promise<ShellExecutionResult>((resolve) => {
            let output = '';
            let error: Error | null = null;

            const onAbort = () => {
                child.kill('SIGTERM');
            };

            signal.addEventListener('abort', onAbort, { once: true });

            child.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                output += chunk;
                onOutput({ type: 'data', chunk });
            });

            child.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                output += chunk;
                onOutput({ type: 'data', chunk });
            });

            child.on('error', (err) => {
                error = err;
            });

            child.on('close', (code, sig) => {
                signal.removeEventListener('abort', onAbort);

                resolve({
                    output,
                    error,
                    exitCode: code,
                    signal: sig,
                    aborted: signal.aborted,
                    pid,
                });
            });
        });

        return { result: resultPromise, pid };
    }
}
