/**
 * Adaptive polling utility with exponential backoff
 *
 * Starts with fast intervals (50ms) and gradually increases to max (1000ms)
 * to balance responsiveness for quick operations with efficiency for long waits.
 */
export interface PollerConfig {
    /** Initial polling interval in milliseconds (default: 50) */
    initialInterval?: number;
    /** Maximum polling interval in milliseconds (default: 1000) */
    maxInterval?: number;
    /** Backoff multiplier (default: 2 for exponential) */
    backoffFactor?: number;
}
export declare class AdaptivePoller {
    private currentInterval;
    private config;
    constructor(config?: PollerConfig);
    /**
     * Get current polling interval in milliseconds
     */
    getCurrentInterval(): number;
    /**
     * Increase polling interval using exponential backoff
     */
    incrementInterval(): void;
    /**
     * Reset polling interval to initial value
     */
    reset(): void;
    /**
     * Async sleep for current interval duration
     */
    wait(): Promise<void>;
}
/**
 * Factory function for creating adaptive pollers
 */
export declare function createAdaptivePoller(config?: PollerConfig): AdaptivePoller;
//# sourceMappingURL=polling.d.ts.map