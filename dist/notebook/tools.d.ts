/**
 * Notebook tools for agent integration
 */
import type { NebulaClient, WriteCellResult } from './client.js';
import type { ToolResult, NotebookCell } from '../types.js';
export interface ReadCellsParams {
    /** Path to the notebook */
    notebookPath: string;
    /** Specific cell indices to read (0-indexed). If omitted, reads all cells. */
    cellIndices?: number[];
    /** Include cell outputs */
    includeOutputs?: boolean;
}
export interface ReadCellsResult {
    cells: NotebookCell[];
    totalCells: number;
}
export declare function readNotebookCells(params: ReadCellsParams, client: NebulaClient): Promise<ToolResult<ReadCellsResult>>;
export interface WriteCellParams {
    /** Path to the notebook */
    notebookPath: string;
    /** Cell index to update (0-indexed), or -1 to append */
    cellIndex: number;
    /** Cell content */
    content: string;
    /** Cell type (default: code) */
    cellType?: 'code' | 'markdown';
}
export declare function writeNotebookCell(params: WriteCellParams, client: NebulaClient): Promise<ToolResult<WriteCellResult>>;
export interface ExecuteCellParams {
    /** Kernel session ID */
    sessionId: string;
    /** Code to execute */
    code: string;
}
export interface ExecuteCellResult {
    outputs: Array<{
        type: string;
        content: string;
    }>;
    success: boolean;
    error?: string;
}
export declare function executeCell(params: ExecuteCellParams, client: NebulaClient): Promise<ToolResult<ExecuteCellResult>>;
export interface SearchCellsParams {
    /** Path to the notebook */
    notebookPath: string;
    /** Search query */
    query: string;
    /** Maximum number of cells to return */
    limit?: number;
    /** Include cell outputs in results */
    includeOutputs?: boolean;
}
export interface SearchCellsResult {
    cells: Array<NotebookCell & {
        index: number;
        score: number;
    }>;
    totalCells: number;
}
/**
 * Simple keyword-based cell search (can be enhanced with embeddings later)
 */
export declare function searchNotebookCells(params: SearchCellsParams, client: NebulaClient): Promise<ToolResult<SearchCellsResult>>;
export declare const readCellsToolDefinition: {
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
export declare const writeCellToolDefinition: {
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
export declare const executeCellToolDefinition: {
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
export declare const searchCellsToolDefinition: {
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
//# sourceMappingURL=tools.d.ts.map