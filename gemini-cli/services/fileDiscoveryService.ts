/**
 * File Discovery Service stub
 */

import path from 'path';
import { globSync } from 'glob';
import { DEFAULT_FILE_EXCLUDES } from '../utils/ignorePatterns.js';

export interface FileFilteringOptions {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
}

export interface FilterResult {
    filteredPaths: string[];
    ignoredCount: number;
}

export class FileDiscoveryService {
    private rootDir: string;
    private excludes: string[];

    constructor(rootDir: string) {
        this.rootDir = rootDir;
        this.excludes = DEFAULT_FILE_EXCLUDES;
    }

    shouldIgnoreFile(filePath: string, _options: FileFilteringOptions): boolean {
        const relativePath = path.relative(this.rootDir, filePath);
        return this.excludes.some(pattern => {
            const regexPattern = pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\//g, '\\/');
            return new RegExp(regexPattern).test(relativePath);
        });
    }

    filterFilesWithReport(paths: string[], options: FileFilteringOptions): FilterResult {
        const filtered: string[] = [];
        let ignored = 0;
        for (const p of paths) {
            const fullPath = path.isAbsolute(p) ? p : path.resolve(this.rootDir, p);
            if (this.shouldIgnoreFile(fullPath, options)) {
                ignored++;
            } else {
                filtered.push(p);
            }
        }
        return { filteredPaths: filtered, ignoredCount: ignored };
    }

    findFiles(pattern: string): string[] {
        return globSync(pattern, {
            cwd: this.rootDir,
            ignore: this.excludes,
            nodir: true,
        });
    }
}
