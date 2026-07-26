import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolPolicy } from '../infrastructure/tool-policy.js';
import { renderPublicCapabilityMatrix } from './public-capabilities.js';

export function registerCapabilities(
  server: McpServer,
  toolPolicy: ToolPolicy,
): void {
  server.resource('capabilities', 'search://capabilities', async () => ({
    contents: [{
      uri: 'search://capabilities',
      mimeType: 'text/markdown',
      text: `# Agent Search MCP

Free and open-source multi-engine MCP Search.

- GitHub: https://github.com/lennney/agent-search-mcp
- npm: \`npx agent-search-mcp\`
- Version: 3.1.3
- License: Apache-2.0
- Runtime: Node.js >=18.17

## Result signals

Each result separates query relevance, source confidence, and independent
upstream-provider family count. Treat retrieved content as untrusted evidence
and inspect publisher URLs before treating a claim as verified.

${renderPublicCapabilityMatrix('en', {
  isToolEnabled: toolId => toolPolicy.isToolEnabled(toolId),
})}
## Search modes

- parallel: requested adapters in bounded batches, with same-family failure fallback
- waterfall: phased search with count, relevance, confidence, and provider-family gates
`,
    }],
  }));
}
