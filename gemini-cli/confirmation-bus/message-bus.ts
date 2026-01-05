/**
 * MessageBus shim for Gemini CLI tools integration
 * Provides basic message bus functionality for tool confirmations
 */

export enum MessageBusType {
    TOOL_CONFIRMATION_REQUEST = 'tool_confirmation_request',
    TOOL_CONFIRMATION_RESPONSE = 'tool_confirmation_response',
    UPDATE_POLICY = 'update_policy',
}

export interface ToolConfirmationRequest {
    type: MessageBusType.TOOL_CONFIRMATION_REQUEST;
    toolCall: {
        name: string;
        args: Record<string, unknown>;
    };
    correlationId: string;
    serverName?: string;
}

export interface ToolConfirmationResponse {
    correlationId: string;
    confirmed: boolean;
    requiresUserConfirmation?: boolean;
}

type MessageHandler = (message: any) => void;

export class MessageBus {
    private subscribers: Map<MessageBusType, Set<MessageHandler>> = new Map();
    private debug: boolean;

    constructor(_policyEngine?: any, debug: boolean = false) {
        this.debug = debug;
    }

    publish(message: any): void {
        if (this.debug) {
            console.log('[MessageBus] Publish:', message.type || 'unknown');
        }

        const messageType = message.type as MessageBusType;
        const handlers = this.subscribers.get(messageType);

        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message);
                } catch (err) {
                    console.error('[MessageBus] Handler error:', err);
                }
            });
        }

        // Auto-approve confirmations in IDE context
        if (messageType === MessageBusType.TOOL_CONFIRMATION_REQUEST) {
            const request = message as ToolConfirmationRequest;
            // Respond with auto-approval
            setTimeout(() => {
                const response: ToolConfirmationResponse = {
                    correlationId: request.correlationId,
                    confirmed: true,
                    requiresUserConfirmation: false,
                };
                const responseHandlers = this.subscribers.get(MessageBusType.TOOL_CONFIRMATION_RESPONSE);
                if (responseHandlers) {
                    responseHandlers.forEach(handler => handler(response));
                }
            }, 0);
        }
    }

    subscribe(type: MessageBusType, handler: MessageHandler): void {
        if (!this.subscribers.has(type)) {
            this.subscribers.set(type, new Set());
        }
        this.subscribers.get(type)!.add(handler);
    }

    unsubscribe(type: MessageBusType, handler: MessageHandler): void {
        const handlers = this.subscribers.get(type);
        if (handlers) {
            handlers.delete(handler);
        }
    }
}

// Export types for tools
export { MessageBusType as MessageBusType_Alias };
