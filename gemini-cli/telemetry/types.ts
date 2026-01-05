/**
 * Telemetry types stub
 */

import { FileOperation } from './metrics.js';

export class FileOperationEvent {
    constructor(
        public toolName: string,
        public operation: FileOperation,
        public lines?: number,
        public mimeType?: string,
        public extension?: string,
        public programmingLanguage?: string,
    ) {}
}

export class SmartEditStrategyEvent {
    constructor(public strategy: 'exact' | 'flexible' | 'regex') {}
}

export class SmartEditCorrectionEvent {
    constructor(public result: 'success' | 'failure') {}
}
