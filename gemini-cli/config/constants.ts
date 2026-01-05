/**
 * Constants for Gemini CLI tools
 */

export interface FileFilteringOptions {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
}

export const DEFAULT_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
    respectGitIgnore: true,
    respectGeminiIgnore: true,
};

// Alias for memory-related code
export const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS = DEFAULT_FILE_FILTERING_OPTIONS;
