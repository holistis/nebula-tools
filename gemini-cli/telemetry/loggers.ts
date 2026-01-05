/**
 * Telemetry loggers stub - no-op implementations
 */

import type { Config } from '../config/config.js';
import type { FileOperationEvent, SmartEditStrategyEvent, SmartEditCorrectionEvent } from './types.js';

export function logFileOperation(_config: Config, _event: FileOperationEvent): void {
    // No-op - telemetry disabled in IDE context
}

export function logSmartEditStrategy(_config: Config, _event: SmartEditStrategyEvent): void {
    // No-op - telemetry disabled in IDE context
}

export function logSmartEditCorrectionEvent(_config: Config, _event: SmartEditCorrectionEvent): void {
    // No-op - telemetry disabled in IDE context
}
