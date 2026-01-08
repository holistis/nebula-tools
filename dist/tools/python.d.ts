/**
 * Python Environment Tools
 *
 * Tools for discovering and managing Python environments.
 */
import type { Tool } from './types.js';
export interface PythonEnvironment {
    name: string;
    path: string;
    version?: string;
    source: string;
    isActive?: boolean;
}
export interface ListPythonEnvironmentsParams {
}
export interface ListPythonEnvironmentsResult {
    environments: PythonEnvironment[];
}
export declare const listPythonEnvironmentsTool: Tool<ListPythonEnvironmentsParams, ListPythonEnvironmentsResult>;
export interface GetPythonInfoParams {
    path?: string;
}
export interface PythonInfo {
    path: string;
    version: string;
    packages?: string[];
}
export declare const getPythonInfoTool: Tool<GetPythonInfoParams, PythonInfo>;
export declare const pythonTools: (Tool<ListPythonEnvironmentsParams, ListPythonEnvironmentsResult> | Tool<GetPythonInfoParams, PythonInfo>)[];
//# sourceMappingURL=python.d.ts.map