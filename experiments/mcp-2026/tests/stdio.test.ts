import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const openClients: Client[] = [];

afterEach(async () => {
  await Promise.all(openClients.splice(0).map(client => client.close()));
});

describe('experimental MCP 2026 stdio entry', () => {
  it('negotiates the modern era through the real stdio subprocess', async () => {
    const client = new Client(
      { name: 'stdio-test-client', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['dist/stdio.js'],
      cwd: process.cwd(),
      stderr: 'pipe',
    });

    await client.connect(transport);
    openClients.push(client);

    expect(client.getProtocolEra()).toBe('modern');
    expect((await client.listTools()).tools.map(tool => tool.name)).toContain('free_search');
  });
});
