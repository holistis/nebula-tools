/**
 * Nebula MCP Server
 *
 * Thin wrapper around the unified tools module.
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 */
import * as readline from 'readline';
import { NebulaClient } from '../notebook/client.js';
import { getToolDefinitions, executeToolForMCP } from '../tools/index.js';
export class NebulaMCPServer {
    client;
    constructor() {
        const baseUrl = process.env.NEBULA_URL || 'http://localhost:8000';
        this.client = new NebulaClient({ baseUrl });
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
                    // Get tool definitions from the unified tools module
                    result = { tools: getToolDefinitions() };
                    break;
                case 'tools/call':
                    // Execute tool using the unified executor
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
        // Delegate to the unified tool executor
        return await executeToolForMCP(name, args, this.client);
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