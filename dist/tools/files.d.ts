/**
 * File Tools
 *
 * Tools for file system operations.
 */
import type { Tool } from './types.js';
export interface ListFilesParams {
    path?: string;
    pattern?: string;
}
export interface FileInfo {
    name: string;
    type: string;
    size?: number;
}
export interface ListFilesResult {
    path: string;
    files: FileInfo[];
}
export declare const listFilesTool: Tool<ListFilesParams, ListFilesResult>;
export interface ReadFileParams {
    path: string;
    max_lines?: number;
}
export interface ReadFileResult {
    path: string;
    content: string;
    truncated: boolean;
}
export declare const readFileTool: Tool<ReadFileParams, ReadFileResult>;
export interface WriteFileParams {
    path: string;
    content: string;
}
export interface WriteFileResult {
    path: string;
    lineCount: number;
}
export declare const writeFileTool: Tool<WriteFileParams, WriteFileResult>;
export declare const fileTools: (Tool<ListFilesParams, ListFilesResult> | Tool<ReadFileParams, ReadFileResult> | Tool<WriteFileParams, WriteFileResult>)[];
//# sourceMappingURL=files.d.ts.map