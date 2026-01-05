/**
 * Web search tools - DuckDuckGo (free, no API key)
 */
/**
 * Search using DuckDuckGo HTML (no API key required)
 */
export async function webSearch(params, options = {}) {
    const limit = params.limit || 10;
    const encodedQuery = encodeURIComponent(params.query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; NebulaTools/1.0)',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            return { success: false, error: `Search failed: ${response.status}` };
        }
        const html = await response.text();
        const results = parseSearchResults(html, limit);
        return {
            success: true,
            data: {
                results,
                query: params.query,
            },
        };
    }
    catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            return { success: false, error: 'Search timeout' };
        }
        return { success: false, error: `Search failed: ${e instanceof Error ? e.message : String(e)}` };
    }
}
/**
 * Parse DuckDuckGo HTML results
 */
function parseSearchResults(html, limit) {
    const results = [];
    // Match result blocks
    const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/a>/g;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
        const url = match[1];
        const title = match[2].trim();
        const snippet = match[3]
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
        if (url && title) {
            results.push({ title, url, snippet });
        }
    }
    // Fallback: simpler regex if the first one doesn't match
    if (results.length === 0) {
        const simpleRegex = /class="result__url"[^>]*>([^<]+)<[\s\S]*?class="result__title"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?class="result__snippet"[^>]*>([^<]+)</g;
        while ((match = simpleRegex.exec(html)) !== null && results.length < limit) {
            results.push({
                url: 'https://' + match[1].trim(),
                title: match[2].trim(),
                snippet: match[3].trim(),
            });
        }
    }
    return results;
}
/**
 * Tool definition for agents
 */
export const webSearchToolDefinition = {
    name: 'web_search',
    description: 'Search the web using DuckDuckGo (no API key required)',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
    },
};
//# sourceMappingURL=search.js.map