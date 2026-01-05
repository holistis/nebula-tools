/**
 * File Operation Tools
 *
 * Tools for file system operations.
 */

import type { Tool } from '../types.js';
import type { NebulaClient } from '../../notebook/client.js';
import { successResponse, errorResponse, truncateWithHeadTail } from '../utils.js';

export const fileTools: Tool[] = [
  {
    name: 'list_files',
    description: 'List files and directories in a path',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list (default: current directory)',
          default: '.',
        },
        pattern: {
          type: 'string',
          description: 'Optional glob pattern to filter files (e.g., "*.ipynb")',
        },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read',
        },
        max_lines: {
          type: 'number',
          description: 'Maximum lines to return (default: 200, uses head/tail truncation)',
          default: 200,
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates or overwrites)',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to write',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
];

export async function handleFileTool(
  name: string,
  args: Record<string, unknown>,
  client: NebulaClient
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  switch (name) {
    case 'list_files': {
      const path = (args.path as string) ?? '.';
      const pattern = args.pattern as string | undefined;

      const result = await client.listFiles(path);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to list files');
      }

      let files = result.data ?? [];

      // Apply pattern filter if provided
      if (pattern) {
        const regex = new RegExp(
          pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
        );
        files = files.filter((f: { name: string }) => regex.test(f.name));
      }

      if (files.length === 0) {
        return successResponse(`No files found in ${path}${pattern ? ` matching "${pattern}"` : ''}`);
      }

      const lines: string[] = [`Contents of ${path}:\n`];
      files.forEach((f: { name: string; type: string }) => {
        const icon = f.type === 'directory' ? '📁' : '📄';
        lines.push(`  ${icon} ${f.name}`);
      });

      return successResponse(lines.join('\n'));
    }

    case 'read_file': {
      const path = args.path as string;
      const maxLines = (args.max_lines as number) ?? 200;

      const result = await client.readFile(path);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to read file');
      }

      const content = result.data?.content ?? '';
      const truncated = truncateWithHeadTail(content, maxLines);

      return successResponse(`File: ${path}\n---\n${truncated}`);
    }

    case 'write_file': {
      const path = args.path as string;
      const content = args.content as string;

      const result = await client.writeFile(path, content);
      if (!result.success) {
        return errorResponse(result.error || 'Failed to write file');
      }

      const lineCount = content.split('\n').length;
      return successResponse(`Wrote ${lineCount} lines to ${path}`);
    }

    default:
      return errorResponse(`Unknown file tool: ${name}`);
  }
}
