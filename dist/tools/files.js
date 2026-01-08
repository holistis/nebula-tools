/**
 * File Tools
 *
 * Tools for file system operations.
 */
// =============================================================================
// Shared Utilities
// =============================================================================
function truncateWithHeadTail(text, maxLines = 100) {
    const lines = text.split('\n');
    if (lines.length <= maxLines)
        return text;
    const headLines = Math.floor(maxLines / 2);
    const tailLines = maxLines - headLines;
    const omitted = lines.length - maxLines;
    return [
        ...lines.slice(0, headLines),
        `\n... [${omitted} lines omitted] ...\n`,
        ...lines.slice(-tailLines),
    ].join('\n');
}
export const listFilesTool = {
    definition: {
        name: 'list_files',
        description: 'List files and directories in a path',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Directory path to list (default: current directory)' },
                pattern: { type: 'string', description: 'Optional glob pattern to filter files (e.g., "*.ipynb")' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        const path = params.path ?? '.';
        const result = await client.listFiles(path);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        let files = result.data ?? [];
        // Apply pattern filter if provided
        if (params.pattern) {
            const regex = new RegExp(params.pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.'));
            files = files.filter((f) => regex.test(f.name));
        }
        return { success: true, data: { path, files } };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { path, files } = result.data;
        if (files.length === 0) {
            return [{ type: 'text', text: `No files found in ${path}` }];
        }
        const lines = [`Contents of ${path}:\n`];
        files.forEach(f => {
            const icon = f.type === 'directory' ? '📁' : '📄';
            lines.push(`  ${icon} ${f.name}`);
        });
        return [{ type: 'text', text: lines.join('\n') }];
    },
};
export const readFileTool = {
    definition: {
        name: 'read_file',
        description: 'Read the contents of a file',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file to read' },
                max_lines: { type: 'number', description: 'Maximum lines to return (default: 200)' },
            },
            required: ['path'],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        const result = await client.readFile(params.path);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        const content = result.data?.content ?? '';
        const maxLines = params.max_lines ?? 200;
        const lines = content.split('\n');
        const truncated = lines.length > maxLines;
        const truncatedContent = truncated ? truncateWithHeadTail(content, maxLines) : content;
        return {
            success: true,
            data: {
                path: params.path,
                content: truncatedContent,
                truncated,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { path, content } = result.data;
        return [{ type: 'text', text: `File: ${path}\n---\n${content}` }];
    },
};
export const writeFileTool = {
    definition: {
        name: 'write_file',
        description: 'Write content to a file (creates or overwrites)',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file to write' },
                content: { type: 'string', description: 'Content to write to the file' },
            },
            required: ['path', 'content'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const result = await client.writeFile(params.path, params.content);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return {
            success: true,
            data: {
                path: params.path,
                lineCount: params.content.split('\n').length,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { path, lineCount } = result.data;
        return [{ type: 'text', text: `Wrote ${lineCount} lines to ${path}` }];
    },
};
// =============================================================================
// Export all file tools
// =============================================================================
export const fileTools = [
    listFilesTool,
    readFileTool,
    writeFileTool,
];
//# sourceMappingURL=files.js.map