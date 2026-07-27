import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const searchWithFallback = vi.hoisted(() => vi.fn());

vi.mock('../../src/tools/free-search.js', () => ({
  searchWithFallback,
}));

import { registerSearchWithSynthesis } from '../../src/tools/search-with-synthesis.js';

interface RegisteredTool {
  config: {
    inputSchema: Record<string, unknown>;
  };
  handler: (input: {
    query: string;
    count: number;
    language: 'auto' | 'en' | 'zh';
    min_confidence: number;
    min_source_count: number;
  }) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

function registerTool(): RegisteredTool {
  let registered: RegisteredTool | undefined;
  const server = {
    registerTool: (
      _name: string,
      config: RegisteredTool['config'],
      handler: RegisteredTool['handler'],
    ) => {
      registered = { config, handler };
    },
  } as unknown as McpServer;

  registerSearchWithSynthesis(server);
  if (!registered) throw new Error('search_with_synthesis was not registered');
  return registered;
}

describe('search_with_synthesis', () => {
  beforeEach(() => {
    searchWithFallback.mockReset();
  });

  it('defaults to no confidence filtering and one required source', () => {
    const tool = registerTool();
    const countSchema = tool.config.inputSchema.count as {
      parse: (value: unknown) => number;
    };
    const confidenceSchema = tool.config.inputSchema.min_confidence as {
      parse: (value: unknown) => number;
    };
    const sourceCountSchema = tool.config.inputSchema.min_source_count as {
      parse: (value: unknown) => number;
    };

    expect(countSchema.parse(undefined)).toBe(10);
    expect(() => countSchema.parse(0)).toThrow();
    expect(() => countSchema.parse(1.5)).toThrow();
    expect(() => countSchema.parse(21)).toThrow();
    expect(confidenceSchema.parse(undefined)).toBe(0);
    expect(sourceCountSchema.parse(undefined)).toBe(1);
  });

  it('uses the 0-1 confidence contract and a separate source-count filter', async () => {
    searchWithFallback.mockResolvedValue({
      results: [],
      meta: { engines: [] },
    });
    const tool = registerTool();

    await tool.handler({
      query: 'test',
      count: 10,
      language: 'auto',
      min_confidence: 0.6,
      min_source_count: 2,
    });

    expect(searchWithFallback).toHaveBeenCalledWith(expect.objectContaining({
      minConfidence: 0.6,
      minSourceCount: 2,
    }));
  });

  it('keeps legacy confidence values 2-3 as source-count aliases', async () => {
    searchWithFallback.mockResolvedValue({
      results: [],
      meta: { engines: [] },
    });
    const tool = registerTool();

    await tool.handler({
      query: 'test',
      count: 10,
      language: 'auto',
      min_confidence: 3,
      min_source_count: 1,
    });

    expect(searchWithFallback).toHaveBeenCalledWith(expect.objectContaining({
      minConfidence: 0,
      minSourceCount: 3,
    }));
  });

  it('preserves per-result source provenance', async () => {
    searchWithFallback.mockResolvedValue({
      results: [{
        title: 'One',
        url: 'https://example.com',
        snippet: 'Snippet',
        confidence: 0.82,
        sources: ['wikipedia', 'bing'],
      }],
      meta: { engines: ['duckduckgo', 'wikipedia', 'bing'] },
    });
    const tool = registerTool();

    const response = await tool.handler({
      query: 'test',
      count: 10,
      language: 'auto',
      min_confidence: 0,
      min_source_count: 1,
    });
    const payload = JSON.parse(response.content[0].text);

    expect(payload.results[0].source).toBe('wikipedia, bing');
  });
});
