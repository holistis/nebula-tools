/**
 * Nebula MCP Server
 *
 * Thin wrapper around the unified tools module.
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 */
import * as readline from 'readline';
import { randomUUID } from 'crypto';
import { NebulaClient } from '../notebook/client.js';
import { getToolDefinitions, executeToolForMCP } from '../tools/index.js';
export class NebulaMCPServer {
    client;
    currentUrl;
    defaultUrl;
    agentId;
    clientName;
    clientVersion = '0.1.0';
    supportedProtocols = ['2025-06-18', '2024-11-05'];
    defaultProtocol = '2024-11-05';
    constructor() {
        // Environment variables:
        // - NEBULA_URL: Server URL (e.g., http://localhost:3000)
        // - NEBULA_CLIENT_NAME: Client app name for lock display (e.g., "Claude Code", "Cursor")
        this.defaultUrl = process.env.NEBULA_URL || 'http://localhost:3000';
        this.currentUrl = this.defaultUrl;
        this.agentId = randomUUID();
        this.clientName = process.env.NEBULA_CLIENT_NAME || 'MCP Agent';
        this.client = new NebulaClient({
            baseUrl: this.currentUrl,
            agentId: this.agentId,
            clientName: this.clientName,
            clientVersion: this.clientVersion,
            autoStartAgentSession: true,
        });
        // Log configuration on startup (to stderr, not stdout which is for JSON-RPC)
        console.error(`[Nebula MCP] Client: ${this.clientName} (${this.agentId.slice(0, 8)})`);
        console.error(`[Nebula MCP] Default URL: ${this.defaultUrl}`);
        if (!process.env.NEBULA_URL) {
            console.error(`[Nebula MCP] Using default URL (NEBULA_URL not set)`);
        }
    }
    /**
     * Connect to a Nebula server
     * All subsequent operations will use this connection
     */
    connectToServer(baseUrl) {
        const url = baseUrl || this.defaultUrl;
        if (url !== this.currentUrl) {
            this.currentUrl = url;
            this.client = new NebulaClient({
                baseUrl: url,
                agentId: this.agentId,
                clientName: this.clientName,
                clientVersion: this.clientVersion,
                autoStartAgentSession: true,
            });
            console.error(`[Nebula MCP] Connected to: ${url}`);
        }
        else {
            console.error(`[Nebula MCP] Already connected to: ${url}`);
        }
    }
    /**
     * Get the current active client
     */
    getClient() {
        return this.client;
    }
    async handleRequest(request) {
        const { id, method, params } = request;
        const responseId = id ?? 0;
        try {
            let result;
            switch (method) {
                case 'initialize':
                    {
                        const requestedProtocol = params && typeof params.protocolVersion === 'string'
                            ? params.protocolVersion
                            : undefined;
                        const protocolVersion = requestedProtocol && this.supportedProtocols.includes(requestedProtocol)
                            ? requestedProtocol
                            : this.defaultProtocol;
                        if (requestedProtocol && requestedProtocol !== protocolVersion) {
                            console.error(`[Nebula MCP] Unsupported protocolVersion "${requestedProtocol}", falling back to ${protocolVersion}`);
                        }
                        result = {
                            protocolVersion,
                            serverInfo: { name: 'nebula-mcp', version: '0.1.0' },
                            capabilities: { tools: {} },
                        };
                    }
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
                    return null;
                default:
                    return {
                        jsonrpc: '2.0',
                        id: responseId,
                        error: { code: -32601, message: `Method not found: ${method}` },
                    };
            }
            return { jsonrpc: '2.0', id: responseId, result };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                jsonrpc: '2.0',
                id: responseId,
                error: { code: -32603, message: `Internal error: ${message}` },
            };
        }
    }
    async handleToolCall(params) {
        const { name, arguments: args = {} } = params;
        // Log tool execution (helps with debugging)
        console.error(`[Nebula MCP] Executing tool: ${name}`);
        try {
            // Special handling for connect_server
            if (name === 'connect_server') {
                const { base_url } = args;
                this.connectToServer(base_url);
                return {
                    content: [{ type: 'text', text: `Connected to ${this.currentUrl}` }],
                };
            }
            // Delegate to the unified tool executor with current client
            const result = await executeToolForMCP(name, args, this.client);
            if (result.isError) {
                console.error(`[Nebula MCP] Tool ${name} failed: ${JSON.stringify(result.content)}`);
            }
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Nebula MCP] Tool ${name} error: ${message}`);
            throw error;
        }
    }
    async start() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });
        console.error('='.repeat(60));
        console.error('Nebula MCP Server Started');
        console.error(`Connected to: ${this.currentUrl}`);
        console.error(`Use connect_server tool to switch instances`);
        console.error(`Protocol: Model Context Protocol (MCP) ${this.defaultProtocol} (supports ${this.supportedProtocols.join(', ')})`);
        console.error('='.repeat(60));
        // Read JSON-RPC messages from stdin
        rl.on('line', async (line) => {
            try {
                const request = JSON.parse(line);
                const response = await this.handleRequest(request);
                if (response) {
                    // Write response to stdout
                    process.stdout.write(JSON.stringify(response) + '\n');
                }
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