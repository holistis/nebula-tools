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
    max_lines?: number;
    max_chars?: number;
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
    max_lines?: number;
    max_chars?: number;
    line_offset?: number;
    save_to_file?: boolean;
}
export interface TruncatedOutput extends CellOutput {
    truncated?: boolean;
    truncation_reason?: string | null;
    total_lines?: number;
    total_chars?: number;
    returned_range?: {
        start_line: number;
        end_line: number;
        char_count: number;
    };
    temp_file?: string;
    temp_file_size?: number;
    is_binary?: boolean;
}
export interface ReadOutputResult {
    cellId: string;
    cellIndex: number;
    outputs: TruncatedOutput[];
    totalOutputs: number;
    temp_files?: string[];
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
export interface ConnectServerParams {
    base_url?: string;
}
export interface ConnectServerResult {
    url: string;
}
export declare const connectServerTool: Tool<ConnectServerParams, ConnectServerResult>;
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
export declare const notebookTools: (Tool<ReadNotebookParams, ReadNotebookResult> | Tool<ReadCellParams, ReadCellResult> | Tool<ReadOutputParams, ReadOutputResult> | Tool<InsertCellParams, InsertCellResult> | Tool<UpdateCellParams, UpdateCellResult> | Tool<DeleteCellParams, void> | Tool<ClearNotebookParams, ClearNotebookResult> | Tool<MoveCellParams, void> | Tool<DuplicateCellParams, DuplicateCellResult> | Tool<SearchCellsParams, SearchCellsResult> | Tool<UpdateMetadataParams, UpdateMetadataResult> | Tool<ConnectServerParams, ConnectServerResult> | Tool<StartAgentSessionParams, StartAgentSessionResult> | Tool<EndAgentSessionParams, EndAgentSessionResult>)[];
//# sourceMappingURL=notebook.d.ts.map