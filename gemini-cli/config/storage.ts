/**
 * Storage stub for memory tool and ripgrep
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

export class Storage {
    private baseDir: string;
    private static globalBinDir: string | null = null;

    constructor(baseDir: string = process.cwd()) {
        this.baseDir = baseDir;
    }

    getProjectTempDir(): string {
        const tempDir = path.join(this.baseDir, '.gemini', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        return tempDir;
    }

    /**
     * Get the global bin directory for storing downloaded binaries like ripgrep
     */
    static getGlobalBinDir(): string {
        if (Storage.globalBinDir) {
            return Storage.globalBinDir;
        }

        // Use ~/.gemini/bin for global binaries
        const homeDir = os.homedir();
        const binDir = path.join(homeDir, '.gemini', 'bin');

        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        Storage.globalBinDir = binDir;
        return binDir;
    }
}
