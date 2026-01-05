/**
 * Free Web Search Tool - No API key required
 * Uses DuckDuckGo HTML search (based on pskill9/web-search MCP)
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface SearchResult {
    title: string;
    url: string;
    description: string;
}

export interface FreeWebSearchToolParams {
    query: string;
    limit?: number;
}

class FreeWebSearchToolInvocation extends BaseToolInvocation<
    FreeWebSearchToolParams,
    ToolResult
> {
    constructor(
        params: FreeWebSearchToolParams,
        messageBus?: MessageBus,
        _toolName?: string,
        _toolDisplayName?: string,
    ) {
        super(params, messageBus, _toolName, _toolDisplayName);
    }

    override getDescription(): string {
        return `Searching the web for: "${this.params.query}"`;
    }

    async execute(_signal: AbortSignal): Promise<ToolResult> {
        const limit = Math.min(this.params.limit || 5, 10);

        try {
            const results = await this.performSearch(this.params.query, limit);

            if (results.length === 0) {
                return {
                    llmContent: `No search results found for "${this.params.query}"`,
                    returnDisplay: `No results found for "${this.params.query}"`,
                };
            }

            const formattedResults = results.map((r, i) =>
                `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.description}`
            ).join('\n\n');

            const llmContent = `Web search results for "${this.params.query}":\n\n${formattedResults}`;

            return {
                llmContent,
                returnDisplay: llmContent,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error searching for "${this.params.query}": ${errorMsg}`,
                returnDisplay: `Search error: ${errorMsg}`,
                error: {
                    message: errorMsg,
                },
            };
        }
    }

    private async performSearch(query: string, limit: number): Promise<SearchResult[]> {
        // Use DuckDuckGo HTML search - more reliable for scraping
        const response = await axios.get('https://html.duckduckgo.com/html/', {
            params: { q: query },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 10000,
        });

        const $ = cheerio.load(response.data);
        const results: SearchResult[] = [];

        // Parse DuckDuckGo search results
        $('.result').each((i, element) => {
            if (results.length >= limit) return false;

            const titleElement = $(element).find('.result__title a');
            const snippetElement = $(element).find('.result__snippet');
            let url = titleElement.attr('href');

            if (titleElement.length && url) {
                // Extract actual URL from DuckDuckGo redirect URL
                // Format: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=...
                const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
                if (uddgMatch) {
                    url = decodeURIComponent(uddgMatch[1]);
                }

                results.push({
                    title: titleElement.text().trim(),
                    url: url,
                    description: snippetElement.text().trim() || '',
                });
            }
        });

        return results;
    }
}

export class FreeWebSearchTool extends BaseDeclarativeTool<
    FreeWebSearchToolParams,
    ToolResult
> {
    static readonly Name = 'web_search_free';

    constructor(messageBus?: MessageBus) {
        super(
            FreeWebSearchTool.Name,
            'Web Search (Free)',
            'Search the web using DuckDuckGo. No API key required. Returns titles, URLs, and descriptions. Limit: 10 results max.',
            Kind.Fetch,
            {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results (default: 5, max: 10)',
                        minimum: 1,
                        maximum: 10,
                    },
                },
                required: ['query'],
            },
            true, // isOutputMarkdown
            false, // canUpdateOutput
            messageBus,
        );
    }

    protected createInvocation(
        params: FreeWebSearchToolParams,
        messageBus?: MessageBus,
        _toolName?: string,
        _toolDisplayName?: string,
    ): ToolInvocation<FreeWebSearchToolParams, ToolResult> {
        return new FreeWebSearchToolInvocation(
            params,
            messageBus,
            _toolName,
            _toolDisplayName,
        );
    }
}
