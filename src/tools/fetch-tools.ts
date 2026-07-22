import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../infrastructure/index.js';

/**
 * Extract GitHub README content from a repository URL.
 */
export async function fetchGithubReadme(url: string): Promise<string> {
  try {
    // Parse GitHub URL to extract owner/repo
    const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!githubMatch) {
      throw new Error('Invalid GitHub URL');
    }

    const [, owner, repo] = githubMatch;
    const cleanRepo = repo.replace(/\.git$/, '');

    // Try common README filenames
    const readmeFiles = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README'];
    
    for (const filename of readmeFiles) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/main/${filename}`;
        const response = await fetch(rawUrl, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const content = await response.text();
          return `# ${owner}/${cleanRepo}\n\n${content}`;
        }
      } catch {
        // Try master branch if main fails
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/master/${filename}`;
          const response = await fetch(rawUrl, {
            signal: AbortSignal.timeout(10000),
          });

          if (response.ok) {
            const content = await response.text();
            return `# ${owner}/${cleanRepo}\n\n${content}`;
          }
        } catch {
          // Continue to next filename
        }
      }
    }

    throw new Error('README not found');
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Failed to fetch GitHub README');
    throw error;
  }
}

/**
 * Extract CSDN article content.
 */
export async function fetchCsdnArticle(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Simple extraction: find article content between common markers
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                        html.match(/<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    
    if (articleMatch) {
      // Basic HTML to text conversion
      const content = articleMatch[1]
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      return content;
    }

    throw new Error('Article content not found');
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Failed to fetch CSDN article');
    throw error;
  }
}

/**
 * Extract Juejin article content.
 */
export async function fetchJuejinArticle(url: string): Promise<string> {
  try {
    // Extract article ID from URL
    const idMatch = url.match(/post\/(\d+)/);
    if (!idMatch) {
      throw new Error('Invalid Juejin URL');
    }

    const articleId = idMatch[1];
    const apiUrl = `https://api.juejin.cn/content_api/v1/article/detail?article_id=${articleId}`;

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.err_no !== 0 || !data.data) {
      throw new Error(data.err_msg || 'Failed to fetch article');
    }

    const article = data.data;
    const content = article.article_info?.markdown_content || article.article_info?.content || '';
    
    return `# ${article.article_info?.title || 'Juejin Article'}\n\n${content}`;
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Failed to fetch Juejin article');
    throw error;
  }
}

/** Register the GitHub README fetch tool. */
export function setupFetchGithubReadme(server: McpServer): void {
  server.tool(
    'fetch_github_readme',
    'Fetch README content from a GitHub repository.\n\n' +
    'Best for: Getting project documentation quickly.\n' +
    'Not recommended for: Non-GitHub URLs — use free_extract instead.\n\n' +
    '@readOnly true @idempotent true — makes outbound HTTP requests to raw.githubusercontent.com.',
    {
      url: z.string().url('Must be a valid URL').describe('GitHub repository URL (e.g., https://github.com/owner/repo)'),
    },
    async ({ url }) => {
      try {
        const content = await fetchGithubReadme(url);
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to fetch GitHub README: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/** Register the CSDN article fetch tool. */
export function setupFetchCsdnArticle(server: McpServer): void {
  server.tool(
    'fetch_csdn_article',
    'Fetch content from a CSDN blog article.\n\n' +
    'Best for: Chinese developer blog content on CSDN.\n' +
    'Not recommended for: Other Chinese sites — use free_extract instead.\n\n' +
    '@readOnly true @idempotent true — makes outbound HTTP requests to the CSDN article URL.',
    {
      url: z.string().url('Must be a valid URL').describe('CSDN article URL'),
    },
    async ({ url }) => {
      try {
        const content = await fetchCsdnArticle(url);
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to fetch CSDN article: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/** Register the Juejin article fetch tool. */
export function setupFetchJuejinArticle(server: McpServer): void {
  server.tool(
    'fetch_juejin_article',
    'Fetch content from a Juejin article.\n\n' +
    'Best for: Chinese developer articles on Juejin.\n' +
    'Not recommended for: Non-Juejin content — use free_extract instead.\n\n' +
    '@readOnly true @idempotent true — makes outbound HTTP requests to juejin.cn API.',
    {
      url: z.string().url('Must be a valid URL').describe('Juejin article URL'),
    },
    async ({ url }) => {
      try {
        const content = await fetchJuejinArticle(url);
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to fetch Juejin article: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Register every fetch tool.
 *
 * Kept for callers that depend on the original bundled registration behavior.
 */
export function setupFetchTools(server: McpServer): void {
  setupFetchGithubReadme(server);
  setupFetchCsdnArticle(server);
  setupFetchJuejinArticle(server);
}
