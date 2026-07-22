import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateUrl } from '../infrastructure/url-validator.js';

export function registerFreeExtract(server: McpServer) {
  server.tool(
    'free_extract',
    `Extract full content from a URL. Returns clean markdown.

Best for: Reading a specific page found in search results.
Not recommended for: Bulk extraction — use search first.

@readOnly true @idempotent true — makes an outbound HTTP request to Jina Reader (r.jina.ai). ` +
    `Has SSRF protection: blocks private IPs, localhost, and metadata endpoints. 10s request timeout.`,
    {
      url: z.string().describe('URL to extract'),
      max_length: z.number().optional().default(5000).describe('Max characters to return'),
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
