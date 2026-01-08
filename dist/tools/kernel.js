/**
 * Kernel Tools
 *
 * Tools for managing Jupyter kernel sessions.
 */
export const listKernelsTool = {
    definition: {
        name: 'list_kernels',
        description: 'List available kernel specifications with display names (includes version info)',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(_params, client) {
        const result = await client.listKernels();
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: { kernels: result.data || [] } };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { kernels } = result.data;
        if (kernels.length === 0) {
            return [{ type: 'text', text: 'No kernels available' }];
        }
        const lines = kernels.map(k => `  - ${k.name}: ${k.displayName} [${k.language}]`);
        return [{ type: 'text', text: `Available kernels:\n${lines.join('\n')}` }];
    },
};
export const kernelStartTool = {
    definition: {
        name: 'kernel_start',
        description: 'Start a new kernel session for a notebook',
        inputSchema: {
            type: 'object',
            properties: {
                kernel_name: { type: 'string', description: 'Kernel name (e.g., python3). Default: python3.' },
                file_path: { type: 'string', description: 'Optional notebook file path to associate with the kernel' },
            },
            required: [],
        },
        annotations: { destructiveHint: false },
    },
    async execute(params, client) {
        const kernelName = params.kernel_name || 'python3';
        const result = await client.startKernel(kernelName, params.file_path);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return {
            success: true,
            data: {
                sessionId: result.data.sessionId,
                kernelName: result.data.kernelName,
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { sessionId, kernelName } = result.data;
        return [{ type: 'text', text: `Kernel started: ${sessionId} (${kernelName})` }];
    },
};
export const kernelStopTool = {
    definition: {
        name: 'kernel_stop',
        description: 'Stop and shutdown a kernel session',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session ID of the kernel to stop' },
            },
            required: ['session_id'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const result = await client.shutdownKernel(params.session_id);
        return result.success ? { success: true } : { success: false, error: result.error };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        return [{ type: 'text', text: 'Kernel stopped' }];
    },
};
export const kernelRestartTool = {
    definition: {
        name: 'kernel_restart',
        description: 'Restart a kernel session (clears all variables)',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session ID of the kernel to restart' },
            },
            required: ['session_id'],
        },
        annotations: { destructiveHint: true },
    },
    async execute(params, client) {
        const result = await client.restartKernel(params.session_id);
        return result.success ? { success: true } : { success: false, error: result.error };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        return [{ type: 'text', text: 'Kernel restarted' }];
    },
};
export const kernelInterruptTool = {
    definition: {
        name: 'kernel_interrupt',
        description: 'Interrupt a running execution in a kernel',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session ID of the kernel to interrupt' },
            },
            required: ['session_id'],
        },
        annotations: { destructiveHint: false },
    },
    async execute(params, client) {
        const result = await client.interruptKernel(params.session_id);
        return result.success ? { success: true } : { success: false, error: result.error };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        return [{ type: 'text', text: 'Kernel interrupted' }];
    },
};
// =============================================================================
// Export all kernel tools
// =============================================================================
export const kernelTools = [
    listKernelsTool,
    kernelStartTool,
    kernelStopTool,
    kernelRestartTool,
    kernelInterruptTool,
];
//# sourceMappingURL=kernel.js.map