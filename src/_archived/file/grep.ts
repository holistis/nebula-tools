/**
 * Grep tool - search file contents using regex
 * Supports: git grep, ripgrep (rg), system grep, JS fallback
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { glob } from 'glob';
import type { GrepMatch, ToolResult, ExecuteOptions } from '../../types.js';

export interface GrepParams {
  /** Regex pattern to search for */
  pattern: string;
  /** Directory to search in (defaults to cwd) */
  path?: string;
  /** File pattern filter (e.g., "*.ts", "*.{js,jsx}") */
  include?: string;
  /** Case insensitive search */
  ignoreCase?: boolean;
  /** Max results to return */
  limit?: number;
}

export interface GrepResult {
  matches: GrepMatch[];
  totalCount: number;
  truncated: boolean;
}

/**
 * Check if a command is available
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const check = process.platform === 'win32' ? 'where' : 'which';
    const child = spawn(check, [command], { stdio: 'ignore' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

/**
 * Parse grep output (file:line:content format)
 */
function parseGrepOutput(output: string, basePath: string): GrepMatch[] {
  const matches: GrepMatch[] = [];
  if (!output.trim()) return matches;

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;

    // Format: file:lineNumber:content
    const firstColon = line.indexOf(':');
    if (firstColon === -1) continue;

    const secondColon = line.indexOf(':', firstColon + 1);
    if (secondColon === -1) continue;

    const filePath = line.substring(0, firstColon);
    const lineNum = parseInt(line.substring(firstColon + 1, secondColon), 10);
    const content = line.substring(secondColon + 1);

    if (!isNaN(lineNum)) {
      matches.push({
        filePath: relative(basePath, resolve(basePath, filePath)) || filePath,
        lineNumber: lineNum,
        content: content.trim(),
      });
    }
  }

  return matches;
}

/**
 * Run grep using git grep
 */
async function gitGrep(
  pattern: string,
  cwd: string,
  include?: string,
  ignoreCase?: boolean
): Promise<GrepMatch[]> {
  const args = ['grep', '-n', '-E'];
  if (ignoreCase) args.push('-i');
  args.push(pattern);
  if (include) args.push('--', include);

  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('close', (code) => {
      if (code === 0 || code === 1) {
        const output = Buffer.concat(chunks).toString('utf8');
        resolve(parseGrepOutput(output, cwd));
      } else {
        reject(new Error(`git grep failed with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

/**
 * Run grep using ripgrep
 */
async function rgGrep(
  pattern: string,
  cwd: string,
  include?: string,
  ignoreCase?: boolean
): Promise<GrepMatch[]> {
  const args = ['-n', '--no-heading'];
  if (ignoreCase) args.push('-i');
  if (include) args.push('-g', include);
  args.push(pattern, '.');

  return new Promise((resolve, reject) => {
    const child = spawn('rg', args, { cwd });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('close', (code) => {
      if (code === 0 || code === 1) {
        const output = Buffer.concat(chunks).toString('utf8');
        resolve(parseGrepOutput(output, cwd));
      } else {
        reject(new Error(`rg failed with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

/**
 * Fallback: JavaScript-based grep
 */
async function jsGrep(
  pattern: string,
  cwd: string,
  include?: string,
  ignoreCase?: boolean
): Promise<GrepMatch[]> {
  const matches: GrepMatch[] = [];
  const regex = new RegExp(pattern, ignoreCase ? 'i' : undefined);
  const globPattern = include || '**/*';

  const files = await glob(globPattern, {
    cwd,
    nodir: true,
    dot: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  });

  for (const file of files) {
    try {
      const content = await readFile(resolve(cwd, file), 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            filePath: file,
            lineNumber: i + 1,
            content: lines[i].trim(),
          });
        }
      }
    } catch {
      // Skip files that can't be read (binary, permissions, etc.)
    }
  }

  return matches;
}

/**
 * Search file contents using regex pattern
 */
export async function grep(
  params: GrepParams,
  options: ExecuteOptions = {}
): Promise<ToolResult<GrepResult>> {
  const cwd = params.path ? resolve(options.cwd || process.cwd(), params.path) : (options.cwd || process.cwd());
  const limit = params.limit || 1000;

  try {
    // Validate regex
    new RegExp(params.pattern);
  } catch (e) {
    return {
      success: false,
      error: `Invalid regex pattern: ${params.pattern}`,
    };
  }

  let matches: GrepMatch[] = [];
  let strategy = 'unknown';

  try {
    // Try ripgrep first (fastest)
    if (await isCommandAvailable('rg')) {
      strategy = 'ripgrep';
      matches = await rgGrep(params.pattern, cwd, params.include, params.ignoreCase);
    }
    // Try git grep if in a git repo
    else if (await isCommandAvailable('git')) {
      strategy = 'git grep';
      matches = await gitGrep(params.pattern, cwd, params.include, params.ignoreCase);
    }
    // Fallback to JS implementation
    else {
      strategy = 'javascript';
      matches = await jsGrep(params.pattern, cwd, params.include, params.ignoreCase);
    }
  } catch (e) {
    // If preferred method fails, try JS fallback
    if (strategy !== 'javascript') {
      try {
        matches = await jsGrep(params.pattern, cwd, params.include, params.ignoreCase);
      } catch (fallbackError) {
        return {
          success: false,
          error: `Grep failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        };
      }
    } else {
      return {
        success: false,
        error: `Grep failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const totalCount = matches.length;
  const truncated = totalCount > limit;

  return {
    success: true,
    data: {
      matches: matches.slice(0, limit),
      totalCount,
      truncated,
    },
  };
}

/**
 * Tool definition for agents
 */
export const grepToolDefinition = {
  name: 'grep',
  description: 'Search file contents using regex pattern. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (defaults to current directory)',
      },
      include: {
        type: 'string',
        description: 'File pattern filter (e.g., "*.ts", "*.{js,jsx}")',
      },
      ignoreCase: {
        type: 'boolean',
        description: 'Case insensitive search',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 1000)',
      },
    },
    required: ['pattern'],
  },
};
