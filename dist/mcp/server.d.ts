/**
 * Nebula MCP Server
 *
 * Implements the Model Context Protocol server for Nebula Notebook.
 * Uses JSON-RPC 2.0 over stdio for communication.
 */
export declare class NebulaMCPServer {
    private client;
    private allTools;
    constructor();
    private handleRequest;
    private handleToolCall;
    start(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map