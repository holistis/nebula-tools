/**
 * MCP Types - Local type definitions for @modelcontextprotocol/sdk
 *
 * These are minimal type definitions to allow the build to succeed
 * when the full SDK is not available. Replace with SDK imports when available.
 */

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

export interface ListToolsRequest {
  method: 'tools/list';
}

export interface CallToolRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface ListToolsResult {
  tools: Tool[];
}

export interface CallToolResult {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
}

export interface McpServer {
  name: string;
  version: string;
  setRequestHandler<T>(schema: T, handler: (request: any) => Promise<any>): void;
  connect(transport: StdioServerTransport): Promise<void>;
  close(): Promise<void>;
}

export interface StdioServerTransport {
  // Transport interface
}

export const ListToolsRequestSchema = { method: 'tools/list' } as const;
export const CallToolRequestSchema = { method: 'tools/call' } as const;
