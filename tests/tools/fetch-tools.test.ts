import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  fetchGithubReadme,
  fetchCsdnArticle,
  fetchJuejinArticle,
  setupFetchCsdnArticle,
  setupFetchGithubReadme,
  setupFetchJuejinArticle,
  setupFetchTools,
} from '../../src/tools/fetch-tools.js';

function createMockServer(registeredTools: string[]): McpServer {
  return {
    tool: (name: string) => {
      registeredTools.push(name);
      return {};
    },
  } as unknown as McpServer;
}

describe('Fetch tools', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('fetchGithubReadme', () => {
    it('fetches README from GitHub', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => '# Test README\n\nThis is a test.',
      });

      const content = await fetchGithubReadme('https://github.com/owner/repo');
      expect(content).toContain('# owner/repo');
      expect(content).toContain('# Test README');
    });

    it('throws on invalid GitHub URL', async () => {
      await expect(fetchGithubReadme('https://example.com')).rejects.toThrow('Invalid GitHub URL');
    });
  });

  describe('fetchCsdnArticle', () => {
    it('fetches CSDN article', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => '<article><h1>Test Article</h1><p>Content</p></article>',
      });

      const content = await fetchCsdnArticle('https://blog.csdn.net/test/article/details/123');
      expect(content).toContain('Test Article');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(fetchCsdnArticle('https://blog.csdn.net/test/article/details/123')).rejects.toThrow();
    });
  });

  describe('fetchJuejinArticle', () => {
    it('fetches Juejin article', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          err_no: 0,
          data: {
            article_info: {
              title: 'Test Juejin Article',
              markdown_content: '# Test\n\nContent here.',
            },
          },
        }),
      });

      const content = await fetchJuejinArticle('https://juejin.cn/post/123456');
      expect(content).toContain('# Test Juejin Article');
      expect(content).toContain('# Test');
    });

    it('throws on invalid Juejin URL', async () => {
      await expect(fetchJuejinArticle('https://juejin.cn/user/123')).rejects.toThrow('Invalid Juejin URL');
    });
  });

  describe('tool registration', () => {
    it('registers only the GitHub README tool when requested', () => {
      const registeredTools: string[] = [];

      setupFetchGithubReadme(createMockServer(registeredTools));

      expect(registeredTools).toEqual(['fetch_github_readme']);
    });

    it('registers only the CSDN article tool when requested', () => {
      const registeredTools: string[] = [];

      setupFetchCsdnArticle(createMockServer(registeredTools));

      expect(registeredTools).toEqual(['fetch_csdn_article']);
    });

    it('registers only the Juejin article tool when requested', () => {
      const registeredTools: string[] = [];

      setupFetchJuejinArticle(createMockServer(registeredTools));

      expect(registeredTools).toEqual(['fetch_juejin_article']);
    });

    it('keeps the legacy setup function registering all fetch tools', () => {
      const registeredTools: string[] = [];

      setupFetchTools(createMockServer(registeredTools));

      expect(registeredTools).toEqual([
        'fetch_github_readme',
        'fetch_csdn_article',
        'fetch_juejin_article',
      ]);
    });
  });
});
