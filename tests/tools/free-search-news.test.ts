import { describe, it, expect } from 'vitest';

describe('free_search_news tool', () => {
  it('module can be imported without errors', async () => {
    const mod = await import('../../src/tools/free-search-news.js');
    expect(mod.registerFreeSearchNews).toBeDefined();
    expect(typeof mod.registerFreeSearchNews).toBe('function');
  });
});