/**
 * Nebula Tools - Shared tools for Nebula Notebook and Nexus Agentic IDE
 *
 * ## Structure
 *
 * - `notebook/` - Notebook-specific tools (unique to nebula-tools)
 * - `gemini-cli/` - Original Gemini CLI tools (from Google, Apache 2.0 license)
 * - `_archived/` - Simplified standalone implementations (for reference/lightweight use)
 *
 * ## Usage
 *
 * ### Notebook Tools (standalone, no dependencies)
 * ```typescript
 * import { createNebulaClient, searchNotebookCells } from 'nebula-tools';
 *
 * const client = createNebulaClient({ baseUrl: 'http://localhost:8000' });
 * const results = await searchNotebookCells({ notebookPath: 'analysis.ipynb', query: 'pandas' }, client);
 * ```
 *
 * ### Gemini CLI Tools (full-featured, from Google)
 * ```typescript
 * // Import the full gemini-cli module
 * import * as geminiCli from 'nebula-tools/gemini-cli';
 *
 * // Or import specific tools
 * import { ReadFileTool } from 'nebula-tools/gemini-cli/tools/read-file';
 * ```
 *
 * Available tools:
 * - read-file, write-file, edit, smart-edit
 * - glob, grep, ripGrep, ls
 * - shell
 * - web-fetch, web-search, free-web-fetch, free-web-search
 * - write-todos, memoryTool
 *
 * Note: These require Gemini CLI Config/MessageBus infrastructure.
 *
 * ### Archived Simplified Tools (standalone, no dependencies)
 * ```typescript
 * import { grep, findFiles, shell } from 'nebula-tools/_archived';
 * ```
 */
export * from './types.js';
export { NebulaClient, createNebulaClient, type NebulaClientConfig, type KernelSession, type ExecutionResult, type WriteCellResult, } from './notebook/client.js';
export { readNotebookCells, writeNotebookCell, executeCell, searchNotebookCells, readCellsToolDefinition, writeCellToolDefinition, executeCellToolDefinition, searchCellsToolDefinition, type ReadCellsParams, type ReadCellsResult, type WriteCellParams, type ExecuteCellParams, type ExecuteCellResult, type SearchCellsParams, type SearchCellsResult, } from './notebook/tools.js';
/**
 * All notebook tool definitions for agent integration
 */
export declare const notebookToolDefinitions: {
    notebook_read_cells: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: {
                notebookPath: {
                    type: string;
                    description: string;
                };
                cellIndices: {
                    type: string;
                    description: string;
                    items: {
                        type: string;
                    };
                };
                includeOutputs: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
    notebook_write_cell: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: {
                notebookPath: {
                    type: string;
                    description: string;
                };
                cellIndex: {
                    type: string;
                    description: string;
                };
                content: {
                    type: string;
                    description: string;
                };
                cellType: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
    notebook_execute: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: {
                sessionId: {
                    type: string;
                    description: string;
                };
                code: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
    notebook_search: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: {
                notebookPath: {
                    type: string;
                    description: string;
                };
                query: {
                    type: string;
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
                includeOutputs: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
};
/**
 * Reference to Gemini CLI tool names available in gemini-cli/tools/
 * These require the full Gemini CLI infrastructure to use.
 */
export declare const geminiCliToolNames: readonly ["read_file", "write_file", "edit", "replace", "glob", "grep", "search_file_content", "list_directory", "run_shell_command", "web_fetch", "google_web_search", "web_fetch_free", "web_search_free", "write_todos", "memory"];
//# sourceMappingURL=index.d.ts.map