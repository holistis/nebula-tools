/**
 * Execution Tools
 *
 * Tools for executing code in kernel sessions with streaming output.
 *
 * Truncation is handled by the backend (Python) for consistency with
 * read_notebook and read_output tools. After execution, outputs are
 * read back via readCellOutputOp which applies backend truncation.
 */
import type { Tool } from './types.js';
import type { CellOutput } from '../types.js';
interface TruncatedOutput extends CellOutput {
    truncated?: boolean;
    truncation_reason?: string | null;
    total_lines?: number;
    total_chars?: number;
}
export interface ExecuteCellParams {
    path: string;
    cell_index?: number;
    cell_id?: string;
    session_id?: string;
    max_wait?: number;
    save_outputs?: boolean;
    max_lines?: number;
    max_chars?: number;
}
export interface ExecuteCellResult {
    cellId: string;
    outputs: TruncatedOutput[];
    elapsed: number;
    saved: boolean;
}
export declare const executeCellTool: Tool<ExecuteCellParams, ExecuteCellResult>;
export declare const executionTools: Tool<ExecuteCellParams, ExecuteCellResult>[];
export {};
//# sourceMappingURL=execution.d.ts.map