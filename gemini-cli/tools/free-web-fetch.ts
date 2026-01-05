/**
 * Free Web Fetch Tool - No API key required
 * Fetches web content and extracts readable text using html-to-text
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import axios from 'axios';
import { convert } from 'html-to-text';

const URL_FETCH_TIMEOUT_MS = 15000;
const MAX_CONTENT_LENGTH = 100000;

export interface FreeWebFetchToolParams {
    url: string;
    selector?: string; // Optional CSS selector to extract specific content
}

/**
 * Parse and validate URL
 */
function parseUrl(urlString: string): { url: string | null; error: string | null } {
    try {
        const url = new URL(urlString);
        if (!['http:', 'https:'].includes(url.protocol)) {
            return { url: null, error: `Unsupported protocol: ${url.protocol}. Only http and https are supported.` };
        }
        return { url: url.href, error: null };
    } catch {
        return { url: null, error: `Invalid URL: ${urlString}` };
    }
}

class FreeWebFetchToolInvocation extends BaseToolInvocation<
    FreeWebFetchToolParams,
    ToolResult
> {
    constructor(
        params: FreeWebFetchToolParams,
        messageBus?: MessageBus,
        _toolName?: string,
        _toolDisplayName?: string,
    ) {
        super(params, messageBus, _toolName, _toolDisplayName);
    }

    override getDescription(): string {
        return `Fetching content from: ${this.params.url}`;
    }

    async execute(_signal: AbortSignal): Promise<ToolResult> {
        let url = this.params.url;

        // Validate URL
        const { url: validUrl, error } = parseUrl(url);
        if (error || !validUrl) {
            return {
                llmContent: `Error: ${error}`,
                returnDisplay: `Error: ${error}`,
                error: { message: error || 'Invalid URL' },
            };
        }
        url = validUrl;

        // Convert GitHub blob URL to raw URL for direct content access
        if (url.includes('github.com') && url.includes('/blob/')) {
            url = url
                .replace('github.com', 'raw.githubusercontent.com')
                .replace('/blob/', '/');
        }

        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                timeout: URL_FETCH_TIMEOUT_MS,
                maxRedirects: 5,
                validateStatus: (status) => status < 400,
            });

            const contentType = response.headers['content-type'] || '';
            let textContent: string;
            let title = '';

            if (contentType.toLowerCase().includes('text/html')) {
                // Extract title from HTML
                const titleMatch = response.data.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch) {
                    title = titleMatch[1].trim();
                }

                // Convert HTML to readable text
                textContent = convert(response.data, {
                    wordwrap: 120,
                    selectors: [
                        { selector: 'a', options: { ignoreHref: false, linkBrackets: ['[', ']'] } },
                        { selector: 'img', format: 'skip' },
                        { selector: 'script', format: 'skip' },
                        { selector: 'style', format: 'skip' },
                        { selector: 'nav', format: 'skip' },
                        { selector: 'footer', format: 'skip' },
                        { selector: 'header', format: 'skip' },
                        { selector: 'aside', format: 'skip' },
                    ],
                });
            } else if (contentType.toLowerCase().includes('application/json')) {
                // Pretty print JSON
                try {
                    const jsonData = typeof response.data === 'string'
                        ? JSON.parse(response.data)
                        : response.data;
                    textContent = JSON.stringify(jsonData, null, 2);
                } catch {
                    textContent = String(response.data);
                }
            } else {
                // Plain text or other formats
                textContent = String(response.data);
            }

            // Truncate if too long
            if (textContent.length > MAX_CONTENT_LENGTH) {
                textContent = textContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
            }

            // Clean up excessive whitespace
            textContent = textContent
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            const header = title
                ? `# ${title}\nSource: ${url}\n\n---\n\n`
                : `Source: ${url}\n\n---\n\n`;

            const llmContent = header + textContent;

            return {
                llmContent,
                returnDisplay: `Fetched content from ${url} (${textContent.length} characters)`,
            };
        } catch (error) {
            let errorMsg: string;
            if (axios.isAxiosError(error)) {
                if (error.response) {
                    errorMsg = `HTTP ${error.response.status}: ${error.response.statusText}`;
                } else if (error.code === 'ECONNABORTED') {
                    errorMsg = 'Request timeout';
                } else if (error.code === 'ENOTFOUND') {
                    errorMsg = 'Domain not found';
                } else {
                    errorMsg = error.message;
                }
            } else {
                errorMsg = error instanceof Error ? error.message : String(error);
            }

            return {
                llmContent: `Error fetching ${url}: ${errorMsg}`,
                returnDisplay: `Error: ${errorMsg}`,
                error: { message: errorMsg },
            };
        }
    }
}

export class FreeWebFetchTool extends BaseDeclarativeTool<
    FreeWebFetchToolParams,
    ToolResult
> {
    static readonly Name = 'web_fetch_free';

    constructor(messageBus?: MessageBus) {
        super(
            FreeWebFetchTool.Name,
            'Web Fetch (Free)',
            'Fetch and extract readable content from a URL. No API key required. Converts HTML to readable text, handles JSON and plain text. Supports GitHub blob URLs (auto-converts to raw). Max content: 100KB.',
            Kind.Fetch,
            {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL to fetch content from (must start with http:// or https://)',
                    },
                },
                required: ['url'],
            },
            true, // isOutputMarkdown
            false, // canUpdateOutput
            messageBus,
        );
    }

    protected override validateToolParamValues(
        params: FreeWebFetchToolParams,
    ): string | null {
        if (!params.url || params.url.trim() === '') {
            return "The 'url' parameter cannot be empty.";
        }

        const { error } = parseUrl(params.url);
        if (error) {
            return error;
        }

        return null;
    }

    protected createInvocation(
        params: FreeWebFetchToolParams,
        messageBus?: MessageBus,
        _toolName?: string,
        _toolDisplayName?: string,
    ): ToolInvocation<FreeWebFetchToolParams, ToolResult> {
        return new FreeWebFetchToolInvocation(
            params,
            messageBus,
            _toolName,
            _toolDisplayName,
        );
    }
}
