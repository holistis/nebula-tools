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
    clients = new Map();
    sessionUrls = new Map(); // notebookPath -> baseUrl
    defaultUrl;
    constructor() {
        // Environment variable: NEBULA_URL (e.g., http://localhost:3000)
        // Default to 3000 (frontend dev server) which proxies to backend
        this.defaultUrl = process.env.NEBULA_URL || 'http://localhost:3000';
        // Log configuration on startup (to stderr, not stdout which is for JSON-RPC)
        console.error(`[Nebula MCP] Default URL: ${this.defaultUrl}`);
        if (!process.env.NEBULA_URL) {
            console.error(`[Nebula MCP] Using default URL (NEBULA_URL not set)`);
            console.error(`[Nebula MCP] Note: Default assumes frontend dev server on :3000 (proxies to backend)`);
        }
    }
    /**
     * Get or create a client for the specified URL
     */
    getClient(baseUrl) {
        if (!this.clients.has(baseUrl)) {
            console.error(`[Nebula MCP] Creating new client for: ${baseUrl}`);
            this.clients.set(baseUrl, new NebulaClient({ baseUrl }));
        }
        return this.clients.get(baseUrl);
    }
    /**
     * Get the appropriate client for a notebook path
     * Uses session URL if available, otherwise default
     */
    getClientForPath(path) {
        const url = this.sessionUrls.get(path) || this.defaultUrl;
        return this.getClient(url);
    }
    /**
     * Register a session URL for a notebook path
     */
    setSessionUrl(path, baseUrl) {
        const url = baseUrl || this.defaultUrl;
        this.sessionUrls.set(path, url);
        console.error(`[Nebula MCP] Session registered: ${path} -> ${url}`);
    }
    /**
     * Clear session URL mapping for a notebook path
     */
    clearSessionUrl(path) {
        if (this.sessionUrls.has(path)) {
            const url = this.sessionUrls.get(path);
            this.sessionUrls.delete(path);
            console.error(`[Nebula MCP] Session cleared: ${path} (was ${url})`);
        }
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
        // Log tool execution (helps with debugging)
        console.error(`[Nebula MCP] Executing tool: ${name}`);
        try {
            // Special handling for start_agent_session: register URL before execution
            if (name === 'start_agent_session') {
                const { path, base_url } = args;
                if (path) {
                    this.setSessionUrl(path, base_url);
                }
            }
            // Get the appropriate client based on the notebook path
            const path = args.path;
            const client = path ? this.getClientForPath(path) : this.getClient(this.defaultUrl);
            // Delegate to the unified tool executor
            const result = await executeToolForMCP(name, args, client);
            // Special handling for end_agent_session: clean up URL mapping
            if (name === 'end_agent_session' && path) {
                this.clearSessionUrl(path);
            }
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
        console.error(`Default URL: ${this.defaultUrl}`);
        console.error(`Multi-instance: Sessions can specify custom base_url`);
        console.error(`Protocol: Model Context Protocol (MCP) 2024-11-05`);
        console.error('='.repeat(60));
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