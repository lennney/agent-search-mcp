import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../src/tools/free-search.js', () => ({
  searchWithFallback: vi.fn(),
}));

import { registerFreeSearchAdvanced } from '../../src/tools/free-search-advanced.js';
import { searchWithFallback } from '../../src/tools/free-search.js';

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

  it('rejects the deprecated time_range instead of silently ignoring it', async () => {
    let handler: ((input: Record<string, unknown>, extra?: {
      signal?: AbortSignal;
    }) => Promise<{
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    }>) | undefined;
    const server = {
      registerTool: (
        _name: string,
        _config: unknown,
        callback: typeof handler,
      ) => {
        handler = callback;
      },
    } as unknown as McpServer;

    registerFreeSearchAdvanced(server);
    const response = await handler?.({
      query: 'latest agent search architecture',
      time_range: 'week',
    });
    const payload = JSON.parse(response?.content[0].text ?? '{}');

    expect(response?.isError).toBe(true);
    expect(payload.error).toMatchObject({
      code: 'UNSUPPORTED_FILTER',
      field: 'time_range',
      requested_value: 'week',
    });
    expect(searchWithFallback).not.toHaveBeenCalled();
  });
});
