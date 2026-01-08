/**
 * Nebula MCP Server
 *
 * Thin wrapper around the unified tools module.
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 */
export declare class NebulaMCPServer {
    private client;
    constructor();
    private handleRequest;
    private handleToolCall;
    start(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map