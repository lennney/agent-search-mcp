import { describe, it, expect } from 'vitest';
import { EnginePolicy } from '../../src/infrastructure/tool-policy.js';
import type { SearchProvider } from '../../src/types.js';

const ALL_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'bing', 'baidu', 'brave', 'tavily', 'exa'];

describe('EnginePolicy', () => {
  describe('empty/null config', () => {
    it('allows all engines when no params provided', () => {
      const policy = new EnginePolicy();
      for (const engine of ALL_ENGINES) {
        expect(policy.isAllowed(engine)).toBe(true);
      }
    });

    it('allows all engines with empty strings', () => {
      const policy = new EnginePolicy('', '');
      for (const engine of ALL_ENGINES) {
        expect(policy.isAllowed(engine)).toBe(true);
      }
    });

    it('allows all engines with undefined params', () => {
      const policy = new EnginePolicy(undefined, undefined);
      for (const engine of ALL_ENGINES) {
        expect(policy.isAllowed(engine)).toBe(true);
      }
    });
  });

  describe('isAllowed', () => {
    it('returns true for an allowed engine', () => {
      const policy = new EnginePolicy('duckduckgo,sogou');
      expect(policy.isAllowed('duckduckgo')).toBe(true);
      expect(policy.isAllowed('sogou')).toBe(true);
    });

    it('returns false for a non-allowed engine', () => {
      const policy = new EnginePolicy('duckduckgo');
      expect(policy.isAllowed('bing')).toBe(false);
      expect(policy.isAllowed('baidu')).toBe(false);
    });

    it('returns false for a denied engine', () => {
      const policy = new EnginePolicy(undefined, 'baidu,brave');
      expect(policy.isAllowed('baidu')).toBe(false);
      expect(policy.isAllowed('brave')).toBe(false);
    });

    it('denied takes priority over allowed', () => {
      const policy = new EnginePolicy('duckduckgo,sogou,bing,baidu', 'baidu');
      expect(policy.isAllowed('baidu')).toBe(false);
      expect(policy.isAllowed('duckduckgo')).toBe(true);
    });

    it('allows engines not in denied list when no allowlist set', () => {
      const policy = new EnginePolicy(undefined, 'baidu');
      expect(policy.isAllowed('baidu')).toBe(false);
      expect(policy.isAllowed('duckduckgo')).toBe(true);
      expect(policy.isAllowed('brave')).toBe(true);
    });
  });

  describe('filterEngines', () => {
    it('returns only allowed engines from a list', () => {
      const policy = new EnginePolicy('duckduckgo,bing');
      const result = policy.filterEngines(['duckduckgo', 'sogou', 'bing', 'baidu']);
      expect(result).toEqual(['duckduckgo', 'bing']);
    });

    it('excludes denied engines from a list', () => {
      const policy = new EnginePolicy(undefined, 'baidu,brave');
      const result = policy.filterEngines(ALL_ENGINES);
      expect(result).not.toContain('baidu');
      expect(result).not.toContain('brave');
      expect(result).toContain('duckduckgo');
      expect(result).toContain('exa');
    });

    it('returns all engines when no policy is set', () => {
      const policy = new EnginePolicy();
      const result = policy.filterEngines(ALL_ENGINES);
      expect(result).toEqual(ALL_ENGINES);
    });

    it('returns empty array when nothing is allowed', () => {
      const policy = new EnginePolicy('', 'duckduckgo,sogou,bing,baidu,brave,tavily,exa');
      const result = policy.filterEngines(ALL_ENGINES);
      expect(result).toEqual([]);
    });

    it('denied wins over allowed in filterEngines', () => {
      const policy = new EnginePolicy('duckduckgo,sogou,bing', 'sogou');
      const result = policy.filterEngines(['duckduckgo', 'sogou', 'bing']);
      expect(result).toEqual(['duckduckgo', 'bing']);
    });
  });

  describe('getAvailableEngines', () => {
    it('delegates to filterEngines', () => {
      const policy = new EnginePolicy('duckduckgo,bing');
      const result = policy.getAvailableEngines(ALL_ENGINES);
      expect(result).toEqual(['duckduckgo', 'bing']);
    });

    it('returns all engines with no restrictions', () => {
      const policy = new EnginePolicy();
      const result = policy.getAvailableEngines(ALL_ENGINES);
      expect(result).toEqual(ALL_ENGINES);
    });
  });

  describe('case sensitivity', () => {
    it('engine names are case-sensitive (lowercase)', () => {
      const policy = new EnginePolicy('DuckDuckGo');
      expect(policy.isAllowed('duckduckgo')).toBe(false);
    });

    it('trims whitespace around engine names', () => {
      const policy = new EnginePolicy(' duckduckgo , sogou ');
      expect(policy.isAllowed('duckduckgo')).toBe(true);
      expect(policy.isAllowed('sogou')).toBe(true);
    });
  });
});