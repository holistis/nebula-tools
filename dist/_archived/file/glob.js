/**
 * Glob tool - find files by pattern
 */
import { glob as globLib } from 'glob';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
/**
 * Find files matching glob pattern
 */
export async function findFiles(params, options = {}) {
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
        const entries = await Promise.all(files.map(async (file) => {
            const fullPath = resolve(cwd, file);
            let mtimeMs;
            if (sortByMtime) {
                try {
                    const stats = await stat(fullPath);
                    mtimeMs = stats.mtimeMs;
                }
                catch {
                    // Ignore stat errors
                }
            }
            return {
                path: fullPath,
                relativePath: file,
                mtimeMs,
            };
        }));
        // Sort by modification time (newest first) then alphabetically
        if (sortByMtime) {
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            entries.sort((a, b) => {
                const aRecent = a.mtimeMs && (now - a.mtimeMs) < oneDay;
                const bRecent = b.mtimeMs && (now - b.mtimeMs) < oneDay;
                if (aRecent && bRecent) {
                    return (b.mtimeMs || 0) - (a.mtimeMs || 0);
                }
                else if (aRecent) {
                    return -1;
                }
                else if (bRecent) {
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
    }
    catch (e) {
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
        type: 'object',
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
//# sourceMappingURL=glob.js.map