/**
 * Execution Tools
 *
 * Tools for executing code in kernel sessions with streaming output.
 */
import type { Tool } from './types.js';
import type { CellOutput } from '../types.js';
export interface ExecuteCellParams {
    path: string;
    cell_index?: number;
    cell_id?: string;
    session_id?: string;
    max_wait?: number;
    save_outputs?: boolean;
}
export interface ExecuteCellResult {
    cellId: string;
    outputs: CellOutput[];
    elapsed: number;
    saved: boolean;
}
export declare const executeCellTool: Tool<ExecuteCellParams, ExecuteCellResult>;
export declare const executionTools: Tool<ExecuteCellParams, ExecuteCellResult>[];
//# sourceMappingURL=execution.d.ts.map