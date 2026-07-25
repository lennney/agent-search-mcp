import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../src/tools/free-search.js', () => ({
  searchWithFallback: vi.fn(),
}));

import { registerFreeSearchAdvanced } from '../../src/tools/free-search-advanced.js';

describe('free_search_advanced schema', () => {
  it('bounds count to positive integers so waterfall batches cannot stall', () => {
    let inputSchema: Record<string, unknown> | undefined;
    const server = {
      registerTool: (
        _name: string,
        config: { inputSchema: Record<string, unknown> },
      ) => {
        inputSchema = config.inputSchema;
      },
    } as unknown as McpServer;

    registerFreeSearchAdvanced(server);
    const countSchema = inputSchema?.count as {
      parse: (value: unknown) => number;
    };

    expect(countSchema.parse(undefined)).toBe(5);
    expect(countSchema.parse(1)).toBe(1);
    expect(countSchema.parse(20)).toBe(20);
    expect(() => countSchema.parse(0)).toThrow();
    expect(() => countSchema.parse(-1)).toThrow();
    expect(() => countSchema.parse(1.5)).toThrow();
    expect(() => countSchema.parse(21)).toThrow();
  });
});
