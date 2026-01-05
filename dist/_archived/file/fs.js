/**
 * File system tools - read, write, edit
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
export async function readFileContent(params, options = {}) {
    const filePath = resolve(options.cwd || process.cwd(), params.path);
    try {
        const content = await readFile(filePath, params.encoding || 'utf8');
        const lines = content.split('\n');
        const lineCount = lines.length;
        let resultLines = lines;
        let truncated = false;
        if (params.startLine || params.endLine) {
            const start = (params.startLine || 1) - 1;
            const end = params.endLine || lines.length;
            resultLines = lines.slice(start, end);
            truncated = start > 0 || end < lines.length;
        }
        return {
            success: true,
            data: {
                content: resultLines.join('\n'),
                lineCount,
                truncated,
            },
        };
    }
    catch (e) {
        const error = e;
        if (error.code === 'ENOENT') {
            return { success: false, error: `File not found: ${params.path}` };
        }
        return { success: false, error: `Failed to read file: ${error.message}` };
    }
}
export async function writeFileContent(params, options = {}) {
    const filePath = resolve(options.cwd || process.cwd(), params.path);
    try {
        if (params.createDirs !== false) {
            await mkdir(dirname(filePath), { recursive: true });
        }
        await writeFile(filePath, params.content, 'utf8');
        return {
            success: true,
            data: {
                path: filePath,
                bytesWritten: Buffer.byteLength(params.content, 'utf8'),
            },
        };
    }
    catch (e) {
        const error = e;
        return { success: false, error: `Failed to write file: ${error.message}` };
    }
}
export async function editFile(params, options = {}) {
    const filePath = resolve(options.cwd || process.cwd(), params.path);
    const expectedReplacements = params.expectedReplacements ?? 1;
    try {
        const originalContent = await readFile(filePath, 'utf8');
        // Count occurrences
        let count = 0;
        let pos = 0;
        while ((pos = originalContent.indexOf(params.oldString, pos)) !== -1) {
            count++;
            pos += params.oldString.length;
        }
        if (count === 0) {
            return {
                success: false,
                error: `String not found in file. Make sure you're matching exact content including whitespace and indentation.`,
            };
        }
        if (count !== expectedReplacements) {
            return {
                success: false,
                error: `Expected ${expectedReplacements} occurrence(s) but found ${count}. Be more specific or set expectedReplacements=${count}.`,
            };
        }
        // Perform replacement
        const newContent = originalContent.split(params.oldString).join(params.newString);
        await writeFile(filePath, newContent, 'utf8');
        return {
            success: true,
            data: {
                path: filePath,
                replacements: count,
                originalContent,
                newContent,
            },
        };
    }
    catch (e) {
        const error = e;
        if (error.code === 'ENOENT') {
            return { success: false, error: `File not found: ${params.path}` };
        }
        return { success: false, error: `Failed to edit file: ${error.message}` };
    }
}
export async function listDirectory(params, options = {}) {
    const dirPath = resolve(options.cwd || process.cwd(), params.path || '.');
    try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        const results = [];
        for (const entry of entries) {
            const item = {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
            };
            if (params.includeStats) {
                try {
                    const stats = await stat(resolve(dirPath, entry.name));
                    item.size = stats.size;
                    item.mtimeMs = stats.mtimeMs;
                }
                catch {
                    // Ignore stat errors
                }
            }
            results.push(item);
        }
        // Sort: directories first, then alphabetically
        results.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        return {
            success: true,
            data: {
                path: dirPath,
                entries: results,
            },
        };
    }
    catch (e) {
        const error = e;
        if (error.code === 'ENOENT') {
            return { success: false, error: `Directory not found: ${params.path}` };
        }
        return { success: false, error: `Failed to list directory: ${error.message}` };
    }
}
// ============================================================================
// Tool Definitions
// ============================================================================
export const readFileToolDefinition = {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Path to the file' },
            startLine: { type: 'number', description: 'Start line (1-indexed)' },
            endLine: { type: 'number', description: 'End line (1-indexed)' },
        },
        required: ['path'],
    },
};
export const writeFileToolDefinition = {
    name: 'write_file',
    description: 'Write content to a file (creates parent directories if needed)',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Path to the file' },
            content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
    },
};
export const editFileToolDefinition = {
    name: 'edit_file',
    description: 'Edit a file by replacing a string. Must match exact content including whitespace.',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Path to the file' },
            oldString: { type: 'string', description: 'Exact text to find and replace' },
            newString: { type: 'string', description: 'Replacement text' },
            expectedReplacements: { type: 'number', description: 'Expected number of replacements (default: 1)' },
        },
        required: ['path', 'oldString', 'newString'],
    },
};
export const listDirToolDefinition = {
    name: 'list_directory',
    description: 'List contents of a directory',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Path to directory (defaults to current)' },
            includeStats: { type: 'boolean', description: 'Include file size and modification time' },
        },
        required: [],
    },
};
//# sourceMappingURL=fs.js.map