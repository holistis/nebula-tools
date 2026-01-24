/**
 * Nebula MCP Server
 *
 * Thin wrapper around the unified tools module.
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 */
import { NebulaClient } from '../notebook/client.js';
export declare class NebulaMCPServer {
    private client;
    private currentUrl;
    private defaultUrl;
    private readonly supportedProtocols;
    private readonly defaultProtocol;
    constructor();
    /**
     * Connect to a Nebula server
     * All subsequent operations will use this connection
     */
    connectToServer(baseUrl?: string): void;
    /**
     * Get the current active client
     */
    getClient(): NebulaClient;
    private handleRequest;
    private handleToolCall;
    start(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map