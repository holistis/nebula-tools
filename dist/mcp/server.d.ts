/**
 * Nebula MCP Server
 *
 * Thin wrapper around the unified tools module.
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 */
export declare class NebulaMCPServer {
    private clients;
    private sessionUrls;
    private defaultUrl;
    constructor();
    /**
     * Get or create a client for the specified URL
     */
    private getClient;
    /**
     * Get the appropriate client for a notebook path
     * Uses session URL if available, otherwise default
     */
    private getClientForPath;
    /**
     * Register a session URL for a notebook path
     */
    setSessionUrl(path: string, baseUrl?: string): void;
    /**
     * Clear session URL mapping for a notebook path
     */
    clearSessionUrl(path: string): void;
    private handleRequest;
    private handleToolCall;
    start(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map