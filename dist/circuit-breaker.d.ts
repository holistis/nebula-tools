/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by temporarily disabling requests to a failing service.
 * When a service fails repeatedly, the circuit "opens" and subsequent requests
 * fail immediately without attempting the operation, allowing the service time to recover.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */
import { ErrorCategory, type ClassifiedError } from './errors.js';
/**
 * Circuit breaker states
 */
export declare enum CircuitState {
    /** Normal operation - requests pass through */
    CLOSED = "CLOSED",
    /** Service is failing - requests fail immediately */
    OPEN = "OPEN",
    /** Testing recovery - limited requests pass through */
    HALF_OPEN = "HALF_OPEN"
}
/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerOptions {
    /** Number of failures before opening the circuit (default: 5) */
    failureThreshold?: number;
    /** Time in ms to wait before trying again after opening (default: 30000) */
    resetTimeout?: number;
    /** Number of successful requests needed to close circuit from half-open (default: 2) */
    successThreshold?: number;
    /** Time window in ms for counting failures (default: 60000) */
    failureWindow?: number;
    /** Categories of errors that should trip the circuit (default: NETWORK, TIMEOUT, SERVER) */
    tripOnCategories?: ErrorCategory[];
    /** Optional name for this circuit breaker (for logging) */
    name?: string;
}
/**
 * Circuit breaker event types
 */
export type CircuitBreakerEvent = {
    type: 'state_change';
    from: CircuitState;
    to: CircuitState;
    reason: string;
} | {
    type: 'failure_recorded';
    error: ClassifiedError;
    failureCount: number;
} | {
    type: 'success_recorded';
    successCount: number;
} | {
    type: 'request_rejected';
    state: CircuitState;
};
/**
 * Event listener type
 */
export type CircuitBreakerListener = (event: CircuitBreakerEvent) => void;
/**
 * Result of a circuit breaker execution
 */
export type CircuitBreakerResult<T> = {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
    rejectedByCircuit: boolean;
    classifiedError?: ClassifiedError;
};
/**
 * Circuit Breaker implementation
 */
export declare class CircuitBreaker {
    private state;
    private failures;
    private successCount;
    private lastFailureTime;
    private openedAt;
    private readonly failureThreshold;
    private readonly resetTimeout;
    private readonly successThreshold;
    private readonly failureWindow;
    private readonly tripOnCategories;
    private readonly name;
    private listeners;
    constructor(options?: CircuitBreakerOptions);
    /**
     * Get current circuit state
     */
    getState(): CircuitState;
    /**
     * Get circuit breaker metrics
     */
    getMetrics(): {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        lastFailureTime: number;
        openedAt: number;
    };
    /**
     * Check if the circuit allows requests
     */
    isAllowed(): boolean;
    /**
     * Execute an operation through the circuit breaker
     */
    execute<T>(operation: () => Promise<T>): Promise<CircuitBreakerResult<T>>;
    /**
     * Record a successful operation
     */
    recordSuccess(): void;
    /**
     * Record a failed operation
     */
    recordFailure(error: ClassifiedError): void;
    /**
     * Manually reset the circuit breaker to closed state
     */
    reset(): void;
    /**
     * Force the circuit open (for testing or emergency)
     */
    forceOpen(): void;
    /**
     * Add an event listener
     */
    onEvent(listener: CircuitBreakerListener): () => void;
    /**
     * Check if state should transition based on time
     */
    private checkStateTransition;
    /**
     * Transition to a new state
     */
    private transitionTo;
    /**
     * Get count of failures within the window
     */
    private getRecentFailureCount;
    /**
     * Emit an event to listeners
     */
    private emit;
}
/**
 * Create a new circuit breaker instance
 */
export declare function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker;
//# sourceMappingURL=circuit-breaker.d.ts.map