/**
 * File system tools - read, write, edit
 */
import type { ToolResult, ExecuteOptions } from '../../types.js';
export interface ReadFileParams {
    /** Path to the file */
    path: string;
    /** Start line (1-indexed, inclusive) */
    startLine?: number;
    /** End line (1-indexed, inclusive) */
    endLine?: number;
    /** Encoding (default: utf8) */
    encoding?: BufferEncoding;
}
export interface ReadFileResult {
    content: string;
    lineCount: number;
    truncated: boolean;
}
export declare function readFileContent(params: ReadFileParams, options?: ExecuteOptions): Promise<ToolResult<ReadFileResult>>;
export interface WriteFileParams {
    /** Path to the file */
    path: string;
    /** Content to write */
    content: string;
    /** Create parent directories if they don't exist (default: true) */
    createDirs?: boolean;
}
export interface WriteFileResult {
    path: string;
    bytesWritten: number;
}
export declare function writeFileContent(params: WriteFileParams, options?: ExecuteOptions): Promise<ToolResult<WriteFileResult>>;
export interface EditFileParams {
    /** Path to the file */
    path: string;
    /** Text to find and replace */
    oldString: string;
    /** Replacement text */
    newString: string;
    /** Expected number of replacements (default: 1) */
    expectedReplacements?: number;
}
export interface EditFileResult {
    path: string;
    replacements: number;
    originalContent: string;
    newContent: string;
}
export declare function editFile(params: EditFileParams, options?: ExecuteOptions): Promise<ToolResult<EditFileResult>>;
export interface ListDirParams {
    /** Path to directory */
    path?: string;
    /** Include file stats (size, mtime) */
    includeStats?: boolean;
}
export interface DirEntry {
    name: string;
    type: 'file' | 'directory';
    size?: number;
    mtimeMs?: number;
}
export interface ListDirResult {
    path: string;
    entries: DirEntry[];
}
export declare function listDirectory(params: ListDirParams, options?: ExecuteOptions): Promise<ToolResult<ListDirResult>>;
export declare const readFileToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            path: {
                type: string;
                description: string;
            };
            startLine: {
                type: string;
                description: string;
            };
            endLine: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const writeFileToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            path: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const editFileToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            path: {
                type: string;
                description: string;
            };
            oldString: {
                type: string;
                description: string;
            };
            newString: {
                type: string;
                description: string;
            };
            expectedReplacements: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare const listDirToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            path: {
                type: string;
                description: string;
            };
            includeStats: {
                type: string;
                description: string;
            };
        };
        required: never[];
    };
};
//# sourceMappingURL=fs.d.ts.map