/**
 * Nebula MCP Server
 *
 * Implements the Model Context Protocol server for Nebula Notebook.
 * Uses JSON-RPC 2.0 over stdio for communication.
 */
import * as readline from 'readline';
import { NebulaClient } from '../notebook/client.js';
import { kernelTools, handleKernelTool } from './tools/kernel.js';
import { notebookTools, handleNotebookTool } from './tools/notebook.js';
import { executionTools, handleExecutionTool } from './tools/execution.js';
import { fileTools, handleFileTool } from './tools/files.js';
export class NebulaMCPServer {
    client;
    allTools;
    constructor() {
        const baseUrl = process.env.NEBULA_URL || 'http://localhost:8000';
        this.client = new NebulaClient({ baseUrl });
        this.allTools = [...kernelTools, ...notebookTools, ...executionTools, ...fileTools];
    }
    async handleRequest(request) {
        const { id, method, params } = request;
        try {
            let result;
            switch (method) {
                case 'initialize':
                    result = {
                        protocolVersion: '2024-11-05',
                        serverInfo: { name: 'nebula-mcp', version: '0.1.0' },
                        capabilities: { tools: {} },
                    };
                    break;
                case 'tools/list':
                    result = { tools: this.allTools };
                    break;
                case 'tools/call':
                    result = await this.handleToolCall(params);
                    break;
                case 'notifications/initialized':
                    // Client notification, no response needed
                    return { jsonrpc: '2.0', id, result: {} };
                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Method not found: ${method}` },
                    };
            }
            return { jsonrpc: '2.0', id, result };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32603, message: `Internal error: ${message}` },
            };
        }
    }
    async handleToolCall(params) {
        const { name, arguments: args = {} } = params;
        try {
            // Route to appropriate handler based on tool prefix
            if (name.startsWith('kernel_') || name === 'list_kernels' || name === 'list_sessions') {
                return await handleKernelTool(name, args, this.client);
            }
            if (name.startsWith('notebook_') || name === 'read_notebook' || name === 'read_cell' || name === 'search_cells') {
                return await handleNotebookTool(name, args, this.client);
            }
            if (name.startsWith('execute_')) {
                return await handleExecutionTool(name, args, this.client);
            }
            if (name.startsWith('file_') || name === 'list_files' || name === 'read_file' || name === 'write_file') {
                return await handleFileTool(name, args, this.client);
            }
            return {
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error: ${message}` }],
                isError: true,
            };
        }
    }
    async start() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });
        console.error('Nebula MCP server started');
        // Read JSON-RPC messages from stdin
        rl.on('line', async (line) => {
            try {
                const request = JSON.parse(line);
                const response = await this.handleRequest(request);
                // Write response to stdout
                process.stdout.write(JSON.stringify(response) + '\n');
            }
            catch (error) {
                // Invalid JSON, send parse error
                const response = {
                    jsonrpc: '2.0',
                    id: 0,
                    error: { code: -32700, message: 'Parse error' },
                };
                process.stdout.write(JSON.stringify(response) + '\n');
            }
        });
        rl.on('close', () => {
            console.error('Nebula MCP server stopped');
            process.exit(0);
        });
    }
}
//# sourceMappingURL=server.js.map