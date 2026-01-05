/**
 * Ignore patterns for file operations
 */

export const COMMON_DIRECTORY_EXCLUDES = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.DS_Store',
];

export const COMMON_IGNORE_PATTERNS: string[] = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.cache/**',
    '**/coverage/**',
    '**/__pycache__/**',
    '**/.venv/**',
    '**/venv/**',
    '**/*.pyc',
    '**/.DS_Store',
    '**/Thumbs.db',
];

export const DEFAULT_FILE_EXCLUDES: string[] = [
    ...COMMON_IGNORE_PATTERNS,
];

export const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.pyc', '.class', '.o', '.obj',
]);

export interface FileExclusionsInterface {
    getGlobExcludes(): string[];
}

export class FileExclusions implements FileExclusionsInterface {
    constructor(_config?: any) {}

    getGlobExcludes(defaults?: string[]): string[] {
        return defaults || DEFAULT_FILE_EXCLUDES;
    }
}
