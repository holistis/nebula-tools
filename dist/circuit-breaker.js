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
import { classifyError, ErrorCategory } from './errors.js';
/**
 * Circuit breaker states
 */
export var CircuitState;
(function (CircuitState) {
    /** Normal operation - requests pass through */
    CircuitState["CLOSED"] = "CLOSED";
    /** Service is failing - requests fail immediately */
    CircuitState["OPEN"] = "OPEN";
    /** Testing recovery - limited requests pass through */
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (CircuitState = {}));
/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
    state = CircuitState.CLOSED;
    failures = []; // Timestamps of failures within the window
    successCount = 0;
    lastFailureTime = 0;
    openedAt = 0;
    failureThreshold;
    resetTimeout;
    successThreshold;
    failureWindow;
    tripOnCategories;
    name;
    listeners = [];
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold ?? 5;
        this.resetTimeout = options.resetTimeout ?? 30000;
        this.successThreshold = options.successThreshold ?? 2;
        this.failureWindow = options.failureWindow ?? 60000;
        this.tripOnCategories = new Set(options.tripOnCategories ?? [ErrorCategory.NETWORK, ErrorCategory.TIMEOUT, ErrorCategory.SERVER]);
        this.name = options.name ?? 'default';
    }
    /**
     * Get current circuit state
     */
    getState() {
        this.checkStateTransition();
        return this.state;
    }
    /**
     * Get circuit breaker metrics
     */
    getMetrics() {
        this.checkStateTransition();
        return {
            state: this.state,
            failureCount: this.getRecentFailureCount(),
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            openedAt: this.openedAt,
        };
    }
    /**
     * Check if the circuit allows requests
     */
    isAllowed() {
        this.checkStateTransition();
        return this.state !== CircuitState.OPEN;
    }
    /**
     * Execute an operation through the circuit breaker
     */
    async execute(operation) {
        this.checkStateTransition();
        // If circuit is open, reject immediately
        if (this.state === CircuitState.OPEN) {
            this.emit({ type: 'request_rejected', state: this.state });
            return {
                success: false,
                error: `Circuit breaker is open (${this.name}). Service temporarily unavailable.`,
                rejectedByCircuit: true,
            };
        }
        try {
            const result = await operation();
            this.recordSuccess();
            return { success: true, data: result };
        }
        catch (error) {
            const classified = classifyError(error);
            this.recordFailure(classified);
            return {
                success: false,
                error: classified.message,
                rejectedByCircuit: false,
                classifiedError: classified,
            };
        }
    }
    /**
     * Record a successful operation
     */
    recordSuccess() {
        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            this.emit({ type: 'success_recorded', successCount: this.successCount });
            if (this.successCount >= this.successThreshold) {
                this.transitionTo(CircuitState.CLOSED, 'Success threshold reached');
            }
        }
        else if (this.state === CircuitState.CLOSED) {
            // In closed state, success helps decay the failure count
            this.emit({ type: 'success_recorded', successCount: this.successCount });
        }
    }
    /**
     * Record a failed operation
     */
    recordFailure(error) {
        // Only trip on configured categories
        if (!this.tripOnCategories.has(error.category)) {
            return;
        }
        const now = Date.now();
        this.failures.push(now);
        this.lastFailureTime = now;
        // Clean up old failures outside the window
        this.failures = this.failures.filter((t) => now - t < this.failureWindow);
        this.emit({
            type: 'failure_recorded',
            error,
            failureCount: this.failures.length,
        });
        if (this.state === CircuitState.HALF_OPEN) {
            // Any failure in half-open state reopens the circuit
            this.transitionTo(CircuitState.OPEN, 'Failure in half-open state');
        }
        else if (this.state === CircuitState.CLOSED && this.failures.length >= this.failureThreshold) {
            // Threshold reached in closed state
            this.transitionTo(CircuitState.OPEN, `Failure threshold reached (${this.failures.length}/${this.failureThreshold})`);
        }
    }
    /**
     * Manually reset the circuit breaker to closed state
     */
    reset() {
        this.failures = [];
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.openedAt = 0;
        if (this.state !== CircuitState.CLOSED) {
            this.transitionTo(CircuitState.CLOSED, 'Manual reset');
        }
    }
    /**
     * Force the circuit open (for testing or emergency)
     */
    forceOpen() {
        if (this.state !== CircuitState.OPEN) {
            this.transitionTo(CircuitState.OPEN, 'Forced open');
        }
    }
    /**
     * Add an event listener
     */
    onEvent(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }
    /**
     * Check if state should transition based on time
     */
    checkStateTransition() {
        if (this.state === CircuitState.OPEN) {
            const now = Date.now();
            if (now - this.openedAt >= this.resetTimeout) {
                this.transitionTo(CircuitState.HALF_OPEN, 'Reset timeout elapsed');
            }
        }
    }
    /**
     * Transition to a new state
     */
    transitionTo(newState, reason) {
        const oldState = this.state;
        this.state = newState;
        if (newState === CircuitState.OPEN) {
            this.openedAt = Date.now();
        }
        else if (newState === CircuitState.HALF_OPEN) {
            this.successCount = 0;
        }
        else if (newState === CircuitState.CLOSED) {
            this.failures = [];
            this.successCount = 0;
            this.openedAt = 0;
        }
        this.emit({ type: 'state_change', from: oldState, to: newState, reason });
    }
    /**
     * Get count of failures within the window
     */
    getRecentFailureCount() {
        const now = Date.now();
        this.failures = this.failures.filter((t) => now - t < this.failureWindow);
        return this.failures.length;
    }
    /**
     * Emit an event to listeners
     */
    emit(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch {
                // Ignore listener errors
            }
        }
    }
}
/**
 * Create a new circuit breaker instance
 */
export function createCircuitBreaker(options) {
    return new CircuitBreaker(options);
}
//# sourceMappingURL=circuit-breaker.js.map