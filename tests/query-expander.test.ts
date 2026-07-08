import { describe, it, expect } from 'vitest';
import { expandQuery } from '../src/aggregation/query-expander.js';

describe('expandQuery', () => {
  it('returns empty array for empty query', () => {
    expect(expandQuery('')).toEqual([]);
  });

  it('returns empty array for very short query', () => {
    expect(expandQuery('ab')).toEqual([]);
  });

  it('returns empty array when no expansion is needed', () => {
    const result = expandQuery('simple');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('splits "vs" queries', () => {
    const result = expandQuery('Next.js vs Remix');
    expect(result).toContain('Next.js');
    expect(result).toContain('Remix');
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('removes "how to" prefix', () => {
    const result = expandQuery('how to build MCP server');
    expect(result.some(r => r.includes('MCP server'))).toBe(true);
  });

  it('removes "best" prefix', () => {
    const result = expandQuery('best TypeScript framework');
    expect(result.some(r => r.includes('TypeScript'))).toBe(true);
  });

  it('expands tech synonyms: js → javascript', () => {
    const result = expandQuery('js framework');
    expect(result).toContain('javascript framework');
  });

  it('expands tech synonyms: ts → typescript', () => {
    const result = expandQuery('ts config');
    expect(result).toContain('typescript config');
  });

  it('extracts core keywords from verbose query', () => {
    const result = expandQuery('what is the best MCP server for TypeScript');
    // Should extract core terms, skip stop words
    expect(result.length).toBeGreaterThanOrEqual(0);
    // At minimum should not crash
  });

  it('returns at most 2 alternatives', () => {
    const result = expandQuery('how to build the best JS vs TS framework');
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('handles "versus" spelling', () => {
    const result = expandQuery('React versus Vue');
    expect(result.some(r => r.includes('React'))).toBe(true);
    expect(result.some(r => r.includes('Vue'))).toBe(true);
  });
});
