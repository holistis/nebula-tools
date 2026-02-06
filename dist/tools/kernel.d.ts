/**
 * Kernel Tools
 *
 * Tools for managing Jupyter kernel sessions.
 */
import type { Tool } from './types.js';
export interface ListKernelsParams {
}
export interface KernelInfo {
    name: string;
    displayName: string;
    language: string;
}
export interface ListKernelsResult {
    kernels: KernelInfo[];
}
export declare const listKernelsTool: Tool<ListKernelsParams, ListKernelsResult>;
export interface KernelStartParams {
    kernel_name?: string;
}
export interface KernelStartResult {
    sessionId: string;
    kernelName: string;
}
export declare const kernelStartTool: Tool<KernelStartParams, KernelStartResult>;
export interface KernelStopParams {
}
export declare const kernelStopTool: Tool<KernelStopParams, void>;
export interface KernelRestartParams {
}
export declare const kernelRestartTool: Tool<KernelRestartParams, void>;
export interface KernelInterruptParams {
}
export declare const kernelInterruptTool: Tool<KernelInterruptParams, void>;
export declare const kernelTools: (Tool<ListKernelsParams, ListKernelsResult> | Tool<KernelStartParams, KernelStartResult> | Tool<KernelStopParams, void>)[];
//# sourceMappingURL=kernel.d.ts.map