/**
 * Shell execution tool - run shell commands
 * Simplified from Gemini CLI shell.ts, removing Config/MessageBus dependencies
 */
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
export declare function executeShell(params: ShellParams, options?: ExecuteOptions): Promise<ToolResult<ShellResult>>;
/**
 * Execute command and return combined output (simpler API)
 */
export declare function shell(command: string, options?: ExecuteOptions & {
    cwd?: string;
    timeout?: number;
}): Promise<ToolResult<string>>;
/**
 * Tool definition for agents
 */
export declare const shellToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            command: {
                type: string;
                description: string;
            };
            cwd: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            timeout: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const executeShellToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            command: {
                type: string;
                description: string;
            };
            cwd: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            timeout: {
                type: string;
                description: string;
            };
            env: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
//# sourceMappingURL=execute.d.ts.map