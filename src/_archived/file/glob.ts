/**
 * Glob tool - find files by pattern
 */

import { glob as globLib } from 'glob';
import { resolve, relative } from 'node:path';
import { stat } from 'node:fs/promises';
import type { GlobEntry, ToolResult, ExecuteOptions } from '../../types.js';

export interface GlobParams {
  /** Glob pattern to match files */
  pattern: string;
  /** Directory to search in (defaults to cwd) */
  path?: string;
  /** Case sensitive matching (default: false) */
  caseSensitive?: boolean;
  /** Include dotfiles (default: true) */
  dot?: boolean;
  /** Max results to return */
  limit?: number;
  /** Sort by modification time, newest first (default: true) */
  sortByMtime?: boolean;
}

export interface GlobResult {
  files: GlobEntry[];
  totalCount: number;
  truncated: boolean;
}

/**
 * Find files matching glob pattern
 */
export async function findFiles(
  params: GlobParams,
  options: ExecuteOptions = {}
): Promise<ToolResult<GlobResult>> {
  const cwd = params.path
    ? resolve(options.cwd || process.cwd(), params.path)
    : (options.cwd || process.cwd());
  const limit = params.limit || 1000;
  const sortByMtime = params.sortByMtime !== false;

  try {
    const files = await globLib(params.pattern, {
      cwd,
      nodir: true,
      dot: params.dot !== false,
      nocase: !params.caseSensitive,
      ignore: ['**/node_modules/**', '**/.git/**'],
      signal: options.signal,
    });

    // Get file stats for sorting
    const entries: GlobEntry[] = await Promise.all(
      files.map(async (file) => {
        const fullPath = resolve(cwd, file);
        let mtimeMs: number | undefined;

        if (sortByMtime) {
          try {
            const stats = await stat(fullPath);
            mtimeMs = stats.mtimeMs;
          } catch {
            // Ignore stat errors
          }
        }

        return {
          path: fullPath,
          relativePath: file,
          mtimeMs,
        };
      })
    );

    // Sort by modification time (newest first) then alphabetically
    if (sortByMtime) {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      entries.sort((a, b) => {
        const aRecent = a.mtimeMs && (now - a.mtimeMs) < oneDay;
        const bRecent = b.mtimeMs && (now - b.mtimeMs) < oneDay;

        if (aRecent && bRecent) {
          return (b.mtimeMs || 0) - (a.mtimeMs || 0);
        } else if (aRecent) {
          return -1;
        } else if (bRecent) {
          return 1;
        }
        return a.relativePath.localeCompare(b.relativePath);
      });
    }

    const totalCount = entries.length;
    const truncated = totalCount > limit;

    return {
      success: true,
      data: {
        files: entries.slice(0, limit),
        totalCount,
        truncated,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: `Glob failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Tool definition for agents
 */
export const globToolDefinition = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns file paths sorted by modification time (newest first).',
  parameters: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.{js,jsx}")',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (defaults to current directory)',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Case sensitive matching (default: false)',
      },
      dot: {
        type: 'boolean',
        description: 'Include dotfiles (default: true)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 1000)',
      },
    },
    required: ['pattern'],
  },
};
