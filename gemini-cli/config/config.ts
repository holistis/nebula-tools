/**
 * Comprehensive Config shim for Gemini CLI tools integration
 * Provides all required methods for tools to function properly
 */

import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { StandardFileSystemService, type FileSystemService } from '../services/fileSystemService.js';

// Simple Gemini client wrapper for web tools
class GeminiClientWrapper {
    private client: GoogleGenAI;

    constructor(apiKey: string) {
        this.client = new GoogleGenAI({ apiKey });
    }

    async generateContent(
        options: { model: string },
        messages: Array<{ role: string; parts: Array<{ text: string }> }>,
        _signal?: AbortSignal
    ): Promise<any> {
        const prompt = messages.map(m => m.parts.map(p => p.text).join('\n')).join('\n');

        const response = await this.client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
        });

        return {
            candidates: [{
                content: {
                    parts: [{ text: response.text || '' }]
                }
            }]
        };
    }
}

// Stub interface for extensions (not used in nexus context)
export interface GeminiCLIExtension {
    name: string;
    version: string;
    tools?: unknown[];
    isActive?: boolean;
    excludeTools?: string[];
    contextFiles?: Array<{ path: string; content: string }>;
}

// Default file filtering options
export const DEFAULT_FILE_FILTERING_OPTIONS = {
    respectGitIgnore: true,
    respectGeminiIgnore: true,
};

export interface FileFilteringOptions {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
}

export interface WorkspaceContext {
    isPathWithinWorkspace(filePath: string): boolean;
    getDirectories(): string[];
}

export interface FileExclusions {
    getGlobExcludes(): string[];
}

export interface FileService {
    shouldIgnoreFile(filePath: string, options: FileFilteringOptions): boolean;
    filterFilesWithReport(paths: string[], options: FileFilteringOptions): { filteredPaths: string[], ignoredCount: number };
}

export interface Storage {
    getProjectTempDir(): string;
}

export class Config {
    private targetDir: string;
    private debugMode: boolean;
    private fileSystemService: FileSystemService;
    private workspaceContext: WorkspaceContext;
    private fileExclusions: FileExclusions;
    private fileService: FileService;
    public storage: Storage;  // Public for tools that access it directly
    private geminiClient: GeminiClientWrapper | null = null;

    constructor(targetDir: string = process.cwd()) {
        this.targetDir = path.resolve(targetDir);
        this.debugMode = process.env.DEBUG === 'true';
        this.fileSystemService = new StandardFileSystemService();

        // Initialize Gemini client if API key is available
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.geminiClient = new GeminiClientWrapper(apiKey);
        }

        const self = this;

        this.workspaceContext = {
            isPathWithinWorkspace(filePath: string): boolean {
                const resolved = path.resolve(filePath);
                return resolved.startsWith(self.targetDir) || resolved.startsWith(self.targetDir + path.sep);
            },
            getDirectories(): string[] {
                return [self.targetDir];
            }
        };

        this.fileExclusions = {
            getGlobExcludes(): string[] {
                return [
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
            }
        };

        this.fileService = {
            shouldIgnoreFile(filePath: string, _options: FileFilteringOptions): boolean {
                const excludes = self.fileExclusions.getGlobExcludes();
                const relativePath = path.relative(self.targetDir, filePath);
                return excludes.some(pattern => {
                    const regexPattern = pattern
                        .replace(/\*\*/g, '.*')
                        .replace(/\*/g, '[^/]*')
                        .replace(/\//g, '\\/');
                    return new RegExp(regexPattern).test(relativePath);
                });
            },
            filterFilesWithReport(paths: string[], options: FileFilteringOptions): { filteredPaths: string[], ignoredCount: number } {
                const filtered: string[] = [];
                let ignored = 0;
                for (const p of paths) {
                    if (this.shouldIgnoreFile(path.resolve(self.targetDir, p), options)) {
                        ignored++;
                    } else {
                        filtered.push(p);
                    }
                }
                return { filteredPaths: filtered, ignoredCount: ignored };
            }
        };

        this.storage = {
            getProjectTempDir(): string {
                const tempDir = path.join(self.targetDir, '.gemini', 'temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                return tempDir;
            }
        };
    }

    getTargetDir(): string {
        return this.targetDir;
    }

    getWorkspaceContext(): WorkspaceContext {
        return this.workspaceContext;
    }

    getDebugMode(): boolean {
        return this.debugMode;
    }

    getFileSystemService(): FileSystemService {
        return this.fileSystemService;
    }

    getFileExclusions(): FileExclusions {
        return this.fileExclusions;
    }

    getFileService(): FileService {
        return this.fileService;
    }

    getFileFilteringOptions(): FileFilteringOptions {
        return DEFAULT_FILE_FILTERING_OPTIONS;
    }

    getStorage(): Storage {
        return this.storage;
    }

    // Storage accessor for tools that use config.storage directly
    get storage_(): Storage {
        return this.storage;
    }

    // Shell tool configuration
    getShellToolInactivityTimeout(): number {
        return 5 * 60 * 1000; // 5 minutes default
    }

    getEnableInteractiveShell(): boolean {
        return true;
    }

    // Approval mode (for confirmation dialogs - auto-approve in IDE context)
    getApprovalMode(): string {
        return 'AUTO_EDIT'; // Auto-approve edits in IDE context
    }

    setApprovalMode(_mode: string): void {
        // No-op in IDE context
    }

    // IDE mode
    getIdeMode(): boolean {
        return true; // Running in IDE context
    }

    // Tool discovery (not used in nexus context)
    getToolDiscoveryCommand(): string | null {
        return null;
    }

    getToolCallCommand(): string | null {
        return null;
    }

    // Excluded tools
    getExcludeTools(): Set<string> {
        return new Set<string>();
    }

    // Allowed tools (for non-interactive mode)
    getAllowedTools(): string[] {
        return [];
    }

    // Interactive mode
    isInteractive(): boolean {
        return false; // Non-interactive in IDE context
    }

    // Summarize tool output config
    getSummarizeToolOutputConfig(): Record<string, boolean> | null {
        return null;
    }

    // LLM clients - return Gemini client if API key is configured
    getGeminiClient(): GeminiClientWrapper | null {
        return this.geminiClient;
    }

    getBaseLlmClient(): any {
        return null;
    }

    // Core tools - return empty array to allow all
    getCoreTools(): string[] {
        return [];
    }

    // MCP configuration (stub)
    getMcpServers(): Map<string, any> {
        return new Map();
    }

    getMcpServerCommand(): string | null {
        return null;
    }

    getAllowedMcpServers(): string[] | null {
        return null;
    }

    getBlockedMcpServers(): string[] | null {
        return null;
    }

    getMcpClientManager(): any {
        return null;
    }

    // Trust folders
    isTrustedFolder(_path: string): boolean {
        return true; // Trust all in IDE context
    }

    // Retry config
    getRetryFetchErrors(): boolean {
        return true;
    }

    // Model config service (stub)
    get modelConfigService(): any {
        return {
            getResolvedConfig: () => ({
                generateContentConfig: {
                    maxOutputTokens: 2000,
                },
            }),
        };
    }

    // Extension loader methods (stubs for nexus context)
    getEnableExtensionReloading(): boolean {
        return false;
    }

    getExtensionLoader(): any {
        return null;
    }

    // Memory discovery methods (stubs)
    getWorkingDir(): string {
        return this.targetDir;
    }

    shouldLoadMemoryFromIncludeDirectories(): boolean {
        return false;
    }

    getImportFormat(): string {
        return 'markdown';
    }

    getDiscoveryMaxDirs(): number {
        return 100;
    }

    setUserMemory(_memory: any): void {
        // No-op
    }

    setGeminiMdFileCount(_count: number): void {
        // No-op
    }

    setGeminiMdFilePaths(_paths: string[]): void {
        // No-op
    }
}

// Create a singleton config for the playground directory
let defaultConfig: Config | null = null;

export function getDefaultConfig(targetDir?: string): Config {
    if (!defaultConfig || (targetDir && targetDir !== defaultConfig.getTargetDir())) {
        defaultConfig = new Config(targetDir || process.cwd());
    }
    return defaultConfig;
}

export function createConfig(targetDir: string): Config {
    return new Config(targetDir);
}
