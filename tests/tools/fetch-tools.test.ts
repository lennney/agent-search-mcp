import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchGithubReadme, fetchCsdnArticle, fetchJuejinArticle } from '../../src/tools/fetch-tools.js';

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
});
