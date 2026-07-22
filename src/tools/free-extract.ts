import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateUrl } from '../infrastructure/url-validator.js';

export function registerFreeExtract(server: McpServer) {
  server.registerTool(
    'free_extract',
    {
      description:
        `Extract full content from a URL. Returns clean markdown text.

Best for: Reading a specific page found in search results to get full context.
Not recommended for: Bulk extraction — use free_search first to find relevant pages.

Behavior: Makes an outbound HTTP request to Jina Reader (r.jina.ai) which fetches and converts the page to markdown. ` +
        `Has SSRF protection: blocks private IPs, localhost, and metadata endpoints. ` +
        `10s request timeout — pages exceeding this will fail with a timeout error. ` +
        `HTTP errors (4xx, 5xx) are returned as structured error responses.`,
      inputSchema: {
        url: z.string().describe('URL to extract content from. Supports any public web page URL (http/https). ' +
          'For best results, use a complete URL including the protocol (https://).'),
        max_length: z.number().optional().default(5000).describe('Maximum characters to return (default: 5000). ' +
          'Content beyond this limit is truncated. Increase for long articles, decrease for quick snippets.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ url, max_length }) => {
      // SSRF 防护
      const validation = validateUrl(url);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: `Error: ${validation.error}` }],
          isError: true,
        };
      }

      try {
        // 使用 Jina Reader
        const res = await fetch(`https://r.jina.ai/${url}`, {
          headers: { 'Accept': 'text/markdown' },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          return {
            content: [{ type: 'text', text: `Error: HTTP ${res.status}` }],
            isError: true,
          };
        }

        const content = await res.text();
        return {
          content: [{ type: 'text', text: content.slice(0, max_length) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
