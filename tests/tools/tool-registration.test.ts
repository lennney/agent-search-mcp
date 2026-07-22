import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registeredTools = vi.hoisted(() => [] as string[]);

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    registerTool(name: string): void {
      registeredTools.push(name);
    }

    resource(): void {}

    async connect(): Promise<void> {}
  }

  return { McpServer: MockMcpServer };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));

async function registerTools(enabledTools: string, disabledTools: string = ''): Promise<string[]> {
  vi.stubEnv('MODE', 'stdio');
  vi.stubEnv('ENABLED_TOOLS', enabledTools);
  vi.stubEnv('DISABLED_TOOLS', disabledTools);

  await import('../../src/index.js');

  return [...registeredTools];
}

describe('configured fetch tool registration', () => {
  beforeEach(() => {
    registeredTools.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers only the individually enabled fetch tool', async () => {
    const tools = await registerTools('fetch_csdn_article');

    expect(tools).toEqual(['fetch_csdn_article']);
  });

  it('gives DISABLED_TOOLS priority for fetch tools', async () => {
    const tools = await registerTools(
      'fetch_github_readme,fetch_csdn_article,fetch_juejin_article',
      'fetch_github_readme,fetch_juejin_article'
    );

    expect(tools).toEqual(['fetch_csdn_article']);
  });
});
