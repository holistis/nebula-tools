/**
 * Debug logger utility
 */

const isDebug = process.env.DEBUG === 'true';

export const debugLogger = {
    log: (...args: any[]) => {
        if (isDebug) console.log('[DEBUG]', ...args);
    },
    debug: (...args: any[]) => {
        if (isDebug) console.log('[DEBUG]', ...args);
    },
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    info: (...args: any[]) => {
        if (isDebug) console.info('[INFO]', ...args);
    },
};
