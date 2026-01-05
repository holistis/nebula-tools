/**
 * Tests for archived web tools (search, fetch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webSearch } from '../../src/_archived/web/search.js';
import { webFetch } from '../../src/_archived/web/fetch.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Web Search Tool', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should search and return results', async () => {
    const mockHtml = `
      <div class="result">
        <a class="result__a" href="https://example.com/page1">Example Page 1</a>
        <a class="result__snippet">This is the first search result snippet</a>
      </div>
      <div class="result">
        <a class="result__a" href="https://example.com/page2">Example Page 2</a>
        <a class="result__snippet">This is the second search result snippet</a>
      </div>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => mockHtml,
    });

    const result = await webSearch({ query: 'test query' });

    expect(result.success).toBe(true);
    expect(result.data?.query).toBe('test query');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('duckduckgo.com'),
      expect.any(Object)
    );
  });

  it('should respect limit parameter', async () => {
    const mockHtml = `
      <a class="result__a" href="https://example.com/1">Page 1</a>
      <a class="result__snippet">Snippet 1</a>
      <a class="result__a" href="https://example.com/2">Page 2</a>
      <a class="result__snippet">Snippet 2</a>
      <a class="result__a" href="https://example.com/3">Page 3</a>
      <a class="result__snippet">Snippet 3</a>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => mockHtml,
    });

    const result = await webSearch({ query: 'test', limit: 2 });

    expect(result.success).toBe(true);
    expect(result.data?.results.length).toBeLessThanOrEqual(2);
  });

  it('should handle search failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await webSearch({ query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('should handle timeout', async () => {
    // Simulate AbortError
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await webSearch({ query: 'test' }, { timeout: 100 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await webSearch({ query: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('should encode query properly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '',
    });

    await webSearch({ query: 'test query with spaces' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('test%20query%20with%20spaces'),
      expect.any(Object)
    );
  });
});

describe('Web Fetch Tool', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch URL and return content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com',
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html><body>Hello</body></html>',
    });

    const result = await webFetch({ url: 'https://example.com' });

    expect(result.success).toBe(true);
    expect(result.data?.content).toContain('Hello');
    expect(result.data?.contentType).toBe('text/html');
    expect(result.data?.truncated).toBe(false);
  });

  it('should strip HTML when textOnly is true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com',
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () =>
        '<html><head><script>code</script></head><body><p>Hello</p><p>World</p></body></html>',
    });

    const result = await webFetch({
      url: 'https://example.com',
      textOnly: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.content).not.toContain('<');
    expect(result.data?.content).not.toContain('script');
    expect(result.data?.content).toContain('Hello');
    expect(result.data?.content).toContain('World');
  });

  it('should truncate long content', async () => {
    const longContent = 'a'.repeat(60000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => longContent,
    });

    const result = await webFetch({
      url: 'https://example.com',
      maxLength: 100,
    });

    expect(result.success).toBe(true);
    expect(result.data?.content.length).toBeLessThanOrEqual(120); // 100 + truncation notice
    expect(result.data?.truncated).toBe(true);
    expect(result.data?.content).toContain('[truncated]');
  });

  it('should handle fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await webFetch({ url: 'https://example.com/notfound' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  it('should handle timeout', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await webFetch(
      { url: 'https://example.com' },
      { timeout: 100 }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await webFetch({ url: 'https://example.com' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection refused');
  });

  it('should follow redirects and report final URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/final-destination',
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => 'Redirected content',
    });

    const result = await webFetch({ url: 'https://example.com/redirect' });

    expect(result.success).toBe(true);
    expect(result.data?.url).toBe('https://example.com/final-destination');
  });

  it('should decode HTML entities when stripping HTML', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com',
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () =>
        '<p>5 &gt; 3 &amp; 2 &lt; 4 &quot;quoted&quot;</p>',
    });

    const result = await webFetch({
      url: 'https://example.com',
      textOnly: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.content).toContain('5 > 3 & 2 < 4 "quoted"');
  });

  it('should set user-agent header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'content',
    });

    await webFetch({ url: 'https://example.com' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('NebulaTools'),
        }),
      })
    );
  });
});
