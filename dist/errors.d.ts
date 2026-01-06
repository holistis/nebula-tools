/**
 * Error classification and handling utilities for nebula-tools
 *
 * Provides structured error types for better error handling and recovery strategies.
 */
/**
 * Error categories for classification
 */
export declare enum ErrorCategory {
    /** Network connectivity issues (connection refused, reset, DNS failures) */
    NETWORK = "NETWORK",
    /** Request timeout exceeded */
    TIMEOUT = "TIMEOUT",
    /** Server-side errors (5xx HTTP status) */
    SERVER = "SERVER",
    /** Client-side errors (4xx HTTP status) */
    CLIENT = "CLIENT",
    /** Validation errors (invalid input, out of range, etc.) */
    VALIDATION = "VALIDATION",
    /** Kernel-related errors (not found, crashed, busy) */
    KERNEL = "KERNEL",
    /** Notebook-related errors (parse failures, missing cells) */
    NOTEBOOK = "NOTEBOOK",
    /** Code execution errors (runtime errors, exceptions) */
    EXECUTION = "EXECUTION",
    /** Unknown or uncategorized errors */
    UNKNOWN = "UNKNOWN"
}
/**
 * Whether an error is recoverable (can be retried or has a fallback)
 */
export type RecoverabilityStatus = 'recoverable' | 'non-recoverable' | 'potentially-recoverable';
/**
 * Structured error information
 */
export interface ClassifiedError {
    /** Original error message */
    message: string;
    /** Error category for programmatic handling */
    category: ErrorCategory;
    /** HTTP status code if applicable */
    statusCode?: number;
    /** Whether this error can be recovered from */
    recoverable: RecoverabilityStatus;
    /** Whether this error should be retried */
    retryable: boolean;
    /** Suggested retry delay in milliseconds (if retryable) */
    retryDelayMs?: number;
    /** Original error for debugging */
    originalError?: unknown;
}
/**
 * Classify an error into a structured format
 */
export declare function classifyError(error: unknown, statusCode?: number): ClassifiedError;
/**
 * Extract error message from various error types
 */
export declare function getErrorMessage(error: unknown): string;
/**
 * Create a user-friendly error message from a classified error
 */
export declare function formatErrorMessage(error: ClassifiedError): string;
/**
 * Check if an error should trigger a retry
 */
export declare function shouldRetry(error: ClassifiedError, attemptNumber: number, maxRetries: number): boolean;
/**
 * Calculate retry delay with exponential backoff
 */
export declare function calculateRetryDelay(error: ClassifiedError, attemptNumber: number): number;
//# sourceMappingURL=errors.d.ts.map