/**
 * Summarizer stub - simplified for IDE integration
 *
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolResult } from '../tools/tools.js';
import type { Config } from '../config/config.js';

/**
 * Simplified summarizer that just returns the output as-is.
 */
export async function summarizeToolOutput(
    _config: Config,
    _modelConfigKey: any,
    textToSummarize: string,
    _geminiClient: any,
    _abortSignal: AbortSignal,
): Promise<string> {
    // Just return the text as-is without summarization
    return textToSummarize;
}

export type Summarizer = (
    config: Config,
    result: ToolResult,
    geminiClient: any,
    abortSignal: AbortSignal,
) => Promise<string>;

export const defaultSummarizer: Summarizer = (
    _config: Config,
    result: ToolResult,
    _geminiClient: any,
    _abortSignal: AbortSignal,
) => Promise.resolve(JSON.stringify(result.llmContent));

export const llmSummarizer: Summarizer = defaultSummarizer;
