/**
 * Python Environment Tools
 *
 * Tools for discovering and managing Python environments.
 */
export const listPythonEnvironmentsTool = {
    definition: {
        name: 'list_python_environments',
        description: 'Discover available Python environments (system, conda, pyenv, venv, homebrew). Useful for selecting which Python to use for a kernel.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(_params, client) {
        const result = await client.listPythonEnvironments();
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return {
            success: true,
            data: {
                environments: result.data ?? [],
            },
        };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { environments } = result.data;
        if (environments.length === 0) {
            return [{ type: 'text', text: 'No Python environments found' }];
        }
        const lines = ['Available Python environments:\n'];
        // Group by source
        const bySource = {};
        for (const env of environments) {
            const source = env.source || 'other';
            if (!bySource[source])
                bySource[source] = [];
            bySource[source].push(env);
        }
        for (const [source, envs] of Object.entries(bySource)) {
            lines.push(`\n${source.toUpperCase()}:`);
            for (const env of envs) {
                const version = env.version ? ` (${env.version})` : '';
                const active = env.isActive ? ' [ACTIVE]' : '';
                lines.push(`  - ${env.name}${version}${active}`);
                lines.push(`    ${env.path}`);
            }
        }
        return [{ type: 'text', text: lines.join('\n') }];
    },
};
export const getPythonInfoTool = {
    definition: {
        name: 'get_python_info',
        description: 'Get detailed information about a Python environment including version and installed packages',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to Python executable (uses system Python if not provided)' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true },
    },
    async execute(params, client) {
        const result = await client.getPythonInfo(params.path);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data };
    },
    formatForMCP(result) {
        if (!result.success) {
            return [{ type: 'text', text: `Error: ${result.error}` }];
        }
        const { path, version, packages } = result.data;
        const lines = [
            `Python: ${path}`,
            `Version: ${version}`,
        ];
        if (packages && packages.length > 0) {
            lines.push(`\nInstalled packages (${packages.length}):`);
            // Show first 20 packages
            const shown = packages.slice(0, 20);
            lines.push(...shown.map(p => `  - ${p}`));
            if (packages.length > 20) {
                lines.push(`  ... and ${packages.length - 20} more`);
            }
        }
        return [{ type: 'text', text: lines.join('\n') }];
    },
};
// =============================================================================
// Export all python tools
// =============================================================================
export const pythonTools = [
    listPythonEnvironmentsTool,
    getPythonInfoTool,
];
//# sourceMappingURL=python.js.map