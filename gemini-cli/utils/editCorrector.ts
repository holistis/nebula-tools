/**
 * Edit Corrector - Simplified version without LLM
 *
 * This provides basic edit correction without requiring LLM clients.
 * For production use, the original editCorrector with LLM fallbacks should be used.
 *
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EditToolParams } from '../tools/edit.js';

/**
 * Defines the result structure for ensureCorrectEdit.
 */
export interface CorrectedEditResult {
    params: {
        file_path: string;
        old_string: string;
        new_string: string;
    };
    occurrences: number;
}

/**
 * Counts occurrences of a substring in a string
 */
export function countOccurrences(str: string, substr: string): number {
    if (substr === '') {
        return 0;
    }
    let count = 0;
    let pos = str.indexOf(substr);
    while (pos !== -1) {
        count++;
        pos = str.indexOf(substr, pos + substr.length);
    }
    return count;
}

/**
 * Unescapes a string that might have been overly escaped by an LLM.
 */
export function unescapeStringForGeminiBug(inputString: string): string {
    return inputString.replace(
        /\\+(n|t|r|'|"|`|\\|\n)/g,
        (_match, capturedChar) => {
            switch (capturedChar) {
                case 'n':
                    return '\n';
                case 't':
                    return '\t';
                case 'r':
                    return '\r';
                case "'":
                    return "'";
                case '"':
                    return '"';
                case '`':
                    return '`';
                case '\\':
                    return '\\';
                case '\n':
                    return '\n';
                default:
                    return capturedChar;
            }
        },
    );
}

/**
 * Ensures the edit parameters are correct by counting occurrences.
 * This is a simplified version that doesn't use LLM correction.
 */
export async function ensureCorrectEdit(
    _filePath: string,
    currentContent: string,
    originalParams: EditToolParams,
    _geminiClient: any,
    _baseLlmClient: any,
    _abortSignal: AbortSignal,
): Promise<CorrectedEditResult> {
    let finalOldString = originalParams.old_string;
    let finalNewString = originalParams.new_string;
    const expectedReplacements = originalParams.expected_replacements ?? 1;

    // Count occurrences of the old string
    let occurrences = countOccurrences(currentContent, finalOldString);

    // If no match, try unescaping
    if (occurrences === 0) {
        const unescaped = unescapeStringForGeminiBug(finalOldString);
        const unescapedOccurrences = countOccurrences(currentContent, unescaped);
        if (unescapedOccurrences === expectedReplacements) {
            finalOldString = unescaped;
            occurrences = unescapedOccurrences;
            // Also unescape new string if old string was unescaped
            finalNewString = unescapeStringForGeminiBug(originalParams.new_string);
        }
    }

    return {
        params: {
            file_path: originalParams.file_path,
            old_string: finalOldString,
            new_string: finalNewString,
        },
        occurrences,
    };
}

/**
 * Ensures file content is correct (simplified - just returns the content)
 */
export async function ensureCorrectFileContent(
    content: string,
    _baseLlmClient: any,
    _abortSignal: AbortSignal,
): Promise<string> {
    return content;
}
