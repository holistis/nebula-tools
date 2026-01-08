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
export interface InsertCellParams {
    path: string;
    cell_id: string;
    content: string;
    cell_type?: 'code' | 'markdown';
    position?: number;
}
export interface InsertCellResult {
    cellIndex: number;
    cellId: string;
    idModified?: boolean;
    requestedId?: string;
}
export declare const insertCellTool: Tool<InsertCellParams, InsertCellResult>;
export interface UpdateCellParams {
    path: string;
    cell_id: string;
    content?: string;
    cell_type?: 'code' | 'markdown';
}
export interface UpdateCellResult {
    cellIndex: number;
    cellId: string;
}
export declare const updateCellTool: Tool<UpdateCellParams, UpdateCellResult>;
export interface DeleteCellParams {
    path: string;
    cell_index?: number;
    cell_id?: string;
}
export declare const deleteCellTool: Tool<DeleteCellParams, void>;
export interface ClearNotebookParams {
    path: string;
}
export interface ClearNotebookResult {
    deletedCount: number;
}
export declare const clearNotebookTool: Tool<ClearNotebookParams, ClearNotebookResult>;
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
export interface StartAgentSessionParams {
    path: string;
    agent_id?: string;
}
export interface StartAgentSessionResult {
    warning?: string;
}
export declare const startAgentSessionTool: Tool<StartAgentSessionParams, StartAgentSessionResult>;
export interface EndAgentSessionParams {
    path: string;
}
export interface EndAgentSessionResult {
    sessionDuration?: number;
    warning?: string;
}
export declare const endAgentSessionTool: Tool<EndAgentSessionParams, EndAgentSessionResult>;
export declare const notebookTools: (Tool<ReadNotebookParams, ReadNotebookResult> | Tool<ReadCellParams, ReadCellResult> | Tool<ReadOutputParams, ReadOutputResult> | Tool<InsertCellParams, InsertCellResult> | Tool<UpdateCellParams, UpdateCellResult> | Tool<DeleteCellParams, void> | Tool<ClearNotebookParams, ClearNotebookResult> | Tool<MoveCellParams, void> | Tool<DuplicateCellParams, DuplicateCellResult> | Tool<SearchCellsParams, SearchCellsResult> | Tool<UpdateMetadataParams, UpdateMetadataResult> | Tool<StartAgentSessionParams, StartAgentSessionResult> | Tool<EndAgentSessionParams, EndAgentSessionResult>)[];
//# sourceMappingURL=notebook.d.ts.map