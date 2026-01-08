/**
 * Nebula MCP Server
 *
 * Thin wrapper around the unified tools module.
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 */

import * as readline from 'readline';
import { NebulaClient } from '../notebook/client.js';
import { getToolDefinitions, executeToolForMCP } from '../tools/index.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export class NebulaMCPServer {
  private client: NebulaClient;

  constructor() {
    const baseUrl = process.env.NEBULA_URL || 'http://localhost:8000';
    this.client = new NebulaClient({ baseUrl });
  }

  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    try {
      let result: unknown;

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
          result = await this.handleToolCall(params as { name: string; arguments?: Record<string, unknown> });
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Internal error: ${message}` },
      };
    }
  }

  private async handleToolCall(params: { name: string; arguments?: Record<string, unknown> }) {
    const { name, arguments: args = {} } = params;
    // Delegate to the unified tool executor
    return await executeToolForMCP(name, args, this.client);
  }

  async start(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    console.error('Nebula MCP server started');

    // Read JSON-RPC messages from stdin
    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const response = await this.handleRequest(request);
        // Write response to stdout
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (error) {
        // Invalid JSON, send parse error
        const response: JsonRpcResponse = {
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
