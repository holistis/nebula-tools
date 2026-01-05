/**
 * MCP Tool Stub for nexus-agentic-ide
 * Provides minimal exports to satisfy imports without full MCP dependencies
 */

import {
    BaseDeclarativeTool,
    Kind,
    type ToolInvocation,
    type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

type ToolParams = Record<string, unknown>;

/**
 * Stub implementation of DiscoveredMCPTool
 * This allows tool-registry to compile without full MCP dependencies
 */
export class DiscoveredMCPTool extends BaseDeclarativeTool<ToolParams, ToolResult> {
    readonly serverName: string;

    constructor(
        serverName: string,
        _mcpTool: any,
        _config?: any,
        messageBus?: MessageBus,
    ) {
        super(
            `mcp_${serverName}_stub`,
            'MCP Tool Stub',
            'Stub MCP tool - not implemented in nexus context',
            Kind.Other,
            { type: 'object', properties: {} },
            false,
            false,
            messageBus,
        );
        this.serverName = serverName;
    }

    getFullyQualifiedPrefix(): string {
        return `mcp__${this.serverName}__`;
    }

    asFullyQualifiedTool(): DiscoveredMCPTool {
        return this;
    }

    protected createInvocation(
        params: ToolParams,
        _messageBus?: MessageBus,
    ): ToolInvocation<ToolParams, ToolResult> {
        throw new Error('MCP tools are not supported in nexus context. Use built-in tools instead.');
    }
}
