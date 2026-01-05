/**
 * Web fetch tool - retrieve and process web content
 */
/**
 * Fetch web content
 */
export async function webFetch(params, options = {}) {
    const maxLength = params.maxLength || 50000;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);
        const response = await fetch(params.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; NebulaTools/1.0)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: controller.signal,
            redirect: 'follow',
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            return { success: false, error: `Fetch failed: ${response.status} ${response.statusText}` };
        }
        const contentType = response.headers.get('content-type') || 'text/plain';
        let content = await response.text();
        // Strip HTML if requested
        if (params.textOnly && contentType.includes('text/html')) {
            content = htmlToText(content);
        }
        const truncated = content.length > maxLength;
        if (truncated) {
            content = content.substring(0, maxLength) + '\n... [truncated]';
        }
        return {
            success: true,
            data: {
                url: response.url, // May differ due to redirects
                content,
                contentType,
                truncated,
            },
        };
    }
    catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            return { success: false, error: 'Fetch timeout' };
        }
        return { success: false, error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}` };
    }
}
/**
 * Convert HTML to plain text
 */
function htmlToText(html) {
    // Remove script and style content
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    // Convert block elements to newlines
    text = text.replace(/<(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    // Normalize whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.replace(/[ \t]+/g, ' ');
    return text.trim();
}
/**
 * Tool definition for agents
 */
export const webFetchToolDefinition = {
    name: 'web_fetch',
    description: 'Fetch and read content from a URL',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'URL to fetch' },
            textOnly: { type: 'boolean', description: 'Extract text only (strip HTML)' },
            maxLength: { type: 'number', description: 'Max content length (default: 50000)' },
        },
        required: ['url'],
    },
};
//# sourceMappingURL=fetch.js.map