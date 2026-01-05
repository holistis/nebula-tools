/**
 * Telemetry index - exports all telemetry utilities
 */

export * from './types.js';
export * from './metrics.js';
export * from './loggers.js';

// Web fetch telemetry (no-op stubs)
export function logWebFetch(_config: any, _event: any): void {
    // No-op
}

export function logWebFetchFallbackAttempt(_config: any, _event: any): void {
    // No-op
}

export class WebFetchFallbackAttemptEvent {
    constructor(
        public fallbackType: string,
        public url?: string,
        public success?: boolean,
    ) {}
}
