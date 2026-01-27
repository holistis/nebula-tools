/**
 * File Tools
 *
 * Tools for file system operations on the Nebula server.
 * These operate on the server's filesystem, not the local MCP client filesystem.
 */
import type { Tool } from './types.js';
export interface ReadFileParams {
    path: string;
}
export interface ReadFileResult {
    path: string;
    content: string;
    type: 'text' | 'notebook';
}
export declare const readFileTool: Tool<ReadFileParams, ReadFileResult>;
export interface WriteFileParams {
    path: string;
    content: string;
}
export interface WriteFileResult {
    path: string;
}
export declare const writeFileTool: Tool<WriteFileParams, WriteFileResult>;
export interface ListDirectoryParams {
    path?: string;
}
export interface ListDirectoryResult {
    path: string;
    entries: Array<{
        name: string;
        type: string;
    }>;
}
export declare const listDirectoryTool: Tool<ListDirectoryParams, ListDirectoryResult>;
export interface DeleteFileParams {
    path: string;
}
export declare const deleteFileTool: Tool<DeleteFileParams, void>;
export interface RenameFileParams {
    old_path: string;
    new_path: string;
}
export interface RenameFileResult {
    oldPath: string;
    newPath: string;
}
export declare const renameFileTool: Tool<RenameFileParams, RenameFileResult>;
export interface DownloadFileParams {
    server_path: string;
    local_path: string;
}
export interface DownloadFileResult {
    serverPath: string;
    localPath: string;
    size: number;
}
export declare const downloadFileTool: Tool<DownloadFileParams, DownloadFileResult>;
export interface UploadFileParams {
    local_path: string;
    server_path: string;
}
export interface UploadFileResult {
    localPath: string;
    serverPath: string;
    size: number;
}
export declare const uploadFileTool: Tool<UploadFileParams, UploadFileResult>;
export declare const fileTools: (Tool<ReadFileParams, ReadFileResult> | Tool<WriteFileParams, WriteFileResult> | Tool<ListDirectoryParams, ListDirectoryResult> | Tool<DeleteFileParams, void> | Tool<RenameFileParams, RenameFileResult> | Tool<DownloadFileParams, DownloadFileResult>)[];
//# sourceMappingURL=files.d.ts.map