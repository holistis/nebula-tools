/**
 * Adaptive polling utility with exponential backoff
 *
 * Starts with fast intervals (50ms) and gradually increases to max (1000ms)
 * to balance responsiveness for quick operations with efficiency for long waits.
 */
export class AdaptivePoller {
    currentInterval;
    config;
    constructor(config = {}) {
        this.config = {
            initialInterval: config.initialInterval ?? 50,
            maxInterval: config.maxInterval ?? 1000,
            backoffFactor: config.backoffFactor ?? 2
        };
        this.currentInterval = this.config.initialInterval;
    }
    /**
     * Get current polling interval in milliseconds
     */
    getCurrentInterval() {
        return this.currentInterval;
    }
    /**
     * Increase polling interval using exponential backoff
     */
    incrementInterval() {
        this.currentInterval = Math.min(this.currentInterval * this.config.backoffFactor, this.config.maxInterval);
    }
    /**
     * Reset polling interval to initial value
     */
    reset() {
        this.currentInterval = this.config.initialInterval;
    }
    /**
     * Async sleep for current interval duration
     */
    async wait() {
        await new Promise(resolve => setTimeout(resolve, this.currentInterval));
    }
}
/**
 * Factory function for creating adaptive pollers
 */
export function createAdaptivePoller(config) {
    return new AdaptivePoller(config);
}
//# sourceMappingURL=polling.js.map