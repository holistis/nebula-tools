/**
 * Notebook Tools
 *
 * Tools for reading, writing, and manipulating notebook cells.
 */
import type { Tool } from './types.js';
import type { NotebookCell, CellOutput } from '../types.js';
export interface ReadNotebookParams {
    path: string;
    include_outputs?: boolean;
    format?: 'brief' | 'detailed';
}
export interface ReadNotebookResult {
    path: string;
    cells: NotebookCell[];
    totalCells: number;
}
export declare const readNotebookTool: Tool<ReadNotebookParams, ReadNotebookResult>;
export interface ReadCellParams {
    path: string;
    cell_index?: number;
    cell_id?: string;
}
export interface ReadCellResult {
    cell: NotebookCell;
    cellIndex: number;
}
export declare const readCellTool: Tool<ReadCellParams, ReadCellResult>;
export interface ReadOutputParams {
    path: string;
    cell_index?: number;
    cell_id?: string;
    output_offset?: number;
    max_wait?: number;
}
export interface ReadOutputResult {
    cellId: string;
    cellIndex: number;
    outputs: CellOutput[];
    totalOutputs: number;
}
export declare const readOutputTool: Tool<ReadOutputParams, ReadOutputResult>;
export interface WriteCellParams {
    path: string;
    cell_index: number;
    content: string;
    cell_type?: 'code' | 'markdown';
    cell_id?: string;
}
export interface WriteCellResult {
    cellIndex: number;
    cellId: string;
    idModified?: boolean;
    requestedId?: string;
}
export declare const writeCellTool: Tool<WriteCellParams, WriteCellResult>;
export interface DeleteCellParams {
    path: string;
    cell_index?: number;
    cell_id?: string;
}
export declare const deleteCellTool: Tool<DeleteCellParams, void>;
export interface MoveCellParams {
    path: string;
    from_index: number;
    to_index: number;
}
export declare const moveCellTool: Tool<MoveCellParams, void>;
export interface DuplicateCellParams {
    path: string;
    cell_index: number;
}
export interface DuplicateCellResult {
    newCellIndex: number;
    totalCells: number;
}
export declare const duplicateCellTool: Tool<DuplicateCellParams, DuplicateCellResult>;
export interface SearchCellsParams {
    path: string;
    query: string;
    limit?: number;
}
export interface SearchCellsResult {
    cells: Array<{
        index: number;
        score: number;
        type: string;
        content: string;
        id: string;
    }>;
    totalCells: number;
}
export declare const searchCellsTool: Tool<SearchCellsParams, SearchCellsResult>;
export interface UpdateMetadataParams {
    path: string;
    cell_id: string;
    changes: Record<string, unknown>;
}
export interface UpdateMetadataResult {
    cellId: string;
    cellIndex: number;
    changes: Record<string, {
        old: unknown;
        new: unknown;
    }>;
    oldCellId?: string;
}
export declare const updateMetadataTool: Tool<UpdateMetadataParams, UpdateMetadataResult>;
export declare const notebookTools: (Tool<ReadNotebookParams, ReadNotebookResult> | Tool<ReadCellParams, ReadCellResult> | Tool<ReadOutputParams, ReadOutputResult> | Tool<WriteCellParams, WriteCellResult> | Tool<DeleteCellParams, void> | Tool<MoveCellParams, void> | Tool<DuplicateCellParams, DuplicateCellResult> | Tool<SearchCellsParams, SearchCellsResult> | Tool<UpdateMetadataParams, UpdateMetadataResult>)[];
//# sourceMappingURL=notebook.d.ts.map