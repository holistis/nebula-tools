/**
 * Shell utilities - simplified stub for IDE integration
 *
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import type { Config } from '../config/config.js';

export const SHELL_TOOL_NAMES = ['run_shell_command', 'ShellTool'];

export type ShellType = 'cmd' | 'powershell' | 'bash';

export interface ShellConfiguration {
    executable: string;
    argsPrefix: string[];
    shell: ShellType;
}

export const isWindows = () => os.platform() === 'win32';

export function getShellConfiguration(): ShellConfiguration {
    if (isWindows()) {
        return {
            executable: 'powershell.exe',
            argsPrefix: ['-NoProfile', '-Command'],
            shell: 'powershell',
        };
    }
    return { executable: 'bash', argsPrefix: ['-c'], shell: 'bash' };
}

export async function initializeShellParsers(): Promise<void> {
    // No-op in simplified version
}

export function getCommandRoot(command: string): string | undefined {
    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);
    return parts.length > 0 ? parts[0] : undefined;
}

export function getCommandRoots(command: string): string[] {
    const root = getCommandRoot(command);
    return root ? [root] : [];
}

export function stripShellWrapper(command: string): string {
    return command.trim();
}

export function splitCommands(command: string): string[] {
    return [command.trim()].filter(Boolean);
}

export function escapeShellArg(arg: string, shell: ShellType): string {
    if (!arg) return '';
    switch (shell) {
        case 'powershell':
            return `'${arg.replace(/'/g, "''")}'`;
        case 'cmd':
            return `"${arg.replace(/"/g, '""')}"`;
        case 'bash':
        default:
            return `'${arg.replace(/'/g, "'\\''")}'`;
    }
}

export function checkCommandPermissions(
    _command: string,
    _config: Config,
    _sessionAllowlist?: Set<string>,
): {
    allAllowed: boolean;
    disallowedCommands: string[];
    blockReason?: string;
    isHardDenial?: boolean;
} {
    // Allow all commands in IDE context
    return { allAllowed: true, disallowedCommands: [] };
}

export function isCommandAllowed(
    _command: string,
    _config: Config,
): { allowed: boolean; reason?: string } {
    return { allowed: true };
}

export function isShellInvocationAllowlisted(
    _invocation: any,
    _allowedPatterns: string[],
): boolean {
    return true;
}
