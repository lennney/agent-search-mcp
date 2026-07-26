import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/infrastructure/config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns defaults when no env vars set', () => {
    delete process.env.MODE;
    delete process.env.PORT;
    delete process.env.ENABLE_CORS;
    delete process.env.CORS_ORIGIN;
    delete process.env.USE_PROXY;
    delete process.env.DEFAULT_ENGINE;
    delete process.env.ALLOWED_ENGINES;
    delete process.env.EVIDENCE_BUDGET_CHARS;
    delete process.env.PROVIDER_COOLDOWN_STORE_PATH;
    delete process.env.SEARCH_CACHE_DIRECTORY;
    delete process.env.SEARCH_CACHE_TTL_MS;
    delete process.env.SEARCH_CACHE_MAX_ENTRIES;
    
    const config = loadConfig();
    expect(config.mode).toBe('stdio');
    expect(config.port).toBe(3000);
    expect(config.enableCors).toBe(false);
    expect(config.corsOrigin).toBe('*');
    expect(config.useProxy).toBe(false);
    expect(config.defaultEngine).toBe('duckduckgo');
    expect(config.allowedEngines).toEqual([]);
    expect(config.evidenceBudgetChars).toBe(1200);
    expect(config.searchBudgetMaxCalls).toBe(16);
    expect(config.searchBudgetMaxElapsedMs).toBe(30_000);
    expect(config.searchBudgetMaxResults).toBe(100);
    expect(config.providerCooldownStorePath).toBe('');
    expect(config.searchCacheDirectory).toBe('');
    expect(config.searchCacheTtlMs).toBe(60_000);
    expect(config.searchCacheMaxEntries).toBe(1_000);
  });

  it('reads and clamps opt-in exact-cache configuration', () => {
    process.env.SEARCH_CACHE_DIRECTORY = './state/exact-cache';
    process.env.SEARCH_CACHE_TTL_MS = '500';
    process.env.SEARCH_CACHE_MAX_ENTRIES = '999999';
    const config = loadConfig();
    expect(config.searchCacheDirectory).toBe('./state/exact-cache');
    expect(config.searchCacheTtlMs).toBe(1_000);
    expect(config.searchCacheMaxEntries).toBe(10_000);
  });

  it('reads an opt-in provider cooldown store path', () => {
    process.env.PROVIDER_COOLDOWN_STORE_PATH = './state/cooldowns.json';
    expect(loadConfig().providerCooldownStorePath).toBe('./state/cooldowns.json');
  });

  it('clamps request budget environment values', () => {
    process.env.SEARCH_BUDGET_MAX_CALLS = '0';
    process.env.SEARCH_BUDGET_MAX_ELAPSED_MS = '999999';
    process.env.SEARCH_BUDGET_MAX_RESULTS = 'bad';
    const config = loadConfig();
    expect(config.searchBudgetMaxCalls).toBe(1);
    expect(config.searchBudgetMaxElapsedMs).toBe(120_000);
    expect(config.searchBudgetMaxResults).toBe(100);
  });

  it('parses and clamps EVIDENCE_BUDGET_CHARS', () => {
    process.env.EVIDENCE_BUDGET_CHARS = '2400';
    expect(loadConfig().evidenceBudgetChars).toBe(2400);

    process.env.EVIDENCE_BUDGET_CHARS = '50';
    expect(loadConfig().evidenceBudgetChars).toBe(200);

    process.env.EVIDENCE_BUDGET_CHARS = '999999';
    expect(loadConfig().evidenceBudgetChars).toBe(20_000);
  });

  it('parses MODE=http correctly', () => {
    process.env.MODE = 'http';
    const config = loadConfig();
    expect(config.mode).toBe('http');
  });

  it('parses MODE=both correctly', () => {
    process.env.MODE = 'both';
    const config = loadConfig();
    expect(config.mode).toBe('both');
  });

  it('parses PORT as number', () => {
    process.env.PORT = '8080';
    const config = loadConfig();
    expect(config.port).toBe(8080);
  });

  it('parses ENABLE_CORS=true as boolean', () => {
    process.env.ENABLE_CORS = 'true';
    const config = loadConfig();
    expect(config.enableCors).toBe(true);
  });

  it('parses ENABLE_CORS=false as boolean', () => {
    process.env.ENABLE_CORS = 'false';
    const config = loadConfig();
    expect(config.enableCors).toBe(false);
  });

  it('parses USE_PROXY=true as boolean', () => {
    process.env.USE_PROXY = 'true';
    const config = loadConfig();
    expect(config.useProxy).toBe(true);
  });

  it('parses ALLOWED_ENGINES as array', () => {
    process.env.ALLOWED_ENGINES = 'duckduckgo,sogou,bing';
    const config = loadConfig();
    expect(config.allowedEngines).toEqual(['duckduckgo', 'sogou', 'bing']);
  });

  it('parses ALLOWED_ENGINES with spaces', () => {
    process.env.ALLOWED_ENGINES = 'duckduckgo , sogou , bing';
    const config = loadConfig();
    expect(config.allowedEngines).toEqual(['duckduckgo', 'sogou', 'bing']);
  });

  it('defaults allowedEngines to empty array', () => {
    delete process.env.ALLOWED_ENGINES;
    const config = loadConfig();
    expect(config.allowedEngines).toEqual([]);
  });

  it('treats MIN_CONFIDENCE within 0..1 as confidence', () => {
    process.env.MIN_CONFIDENCE = '0.7';
    delete process.env.MIN_SOURCE_COUNT;
    const config = loadConfig();
    expect(config.minConfidence).toBe(0.7);
    expect(config.minSourceCount).toBe(1);
  });

  it('maps legacy MIN_CONFIDENCE source counts to MIN_SOURCE_COUNT', () => {
    process.env.MIN_CONFIDENCE = '2';
    delete process.env.MIN_SOURCE_COUNT;
    const config = loadConfig();
    expect(config.minConfidence).toBe(0);
    expect(config.minSourceCount).toBe(2);
  });

  it('prefers an explicit MIN_SOURCE_COUNT', () => {
    process.env.MIN_CONFIDENCE = '0.6';
    process.env.MIN_SOURCE_COUNT = '3';
    const config = loadConfig();
    expect(config.minConfidence).toBe(0.6);
    expect(config.minSourceCount).toBe(3);
  });

  it('parses HTTP authentication and origin settings', () => {
    process.env.HTTP_AUTH_TOKEN = 'test-token';
    process.env.ALLOWED_ORIGINS = 'https://one.example, https://two.example';
    const config = loadConfig();
    expect(config.httpAuthToken).toBe('test-token');
    expect(config.allowedOrigins).toEqual(['https://one.example', 'https://two.example']);
  });

  it('parses ENABLED_TOOLS as array', () => {
    process.env.ENABLED_TOOLS = 'free_search,free_extract';
    const config = loadConfig();
    expect(config.enabledTools).toEqual(['free_search', 'free_extract']);
  });

  it('parses ENABLED_TOOLS with spaces', () => {
    process.env.ENABLED_TOOLS = ' free_search , free_extract ';
    const config = loadConfig();
    expect(config.enabledTools).toEqual(['free_search', 'free_extract']);
  });

  it('defaults enabledTools to empty array', () => {
    delete process.env.ENABLED_TOOLS;
    const config = loadConfig();
    expect(config.enabledTools).toEqual([]);
  });

  it('parses DISABLED_TOOLS as array', () => {
    process.env.DISABLED_TOOLS = 'free_extract,fetch_github_readme';
    const config = loadConfig();
    expect(config.disabledTools).toEqual(['free_extract', 'fetch_github_readme']);
  });

  it('defaults disabledTools to empty array', () => {
    delete process.env.DISABLED_TOOLS;
    const config = loadConfig();
    expect(config.disabledTools).toEqual([]);
  });

  // ── Semantic layer (P2) ─────────────────────────────────────────────

  it('defaults semanticDedup to false', () => {
    const config = loadConfig();
    expect(config.semanticDedup).toBe(false);
  });

  it('parses SEMANTIC_DEDUP=true as boolean', () => {
    process.env.SEMANTIC_DEDUP = 'true';
    const config = loadConfig();
    expect(config.semanticDedup).toBe(true);
  });

  it('defaults dedupThreshold to 0.85', () => {
    const config = loadConfig();
    expect(config.dedupThreshold).toBe(0.85);
  });

  it('parses DEDUP_THRESHOLD=0.9', () => {
    process.env.DEDUP_THRESHOLD = '0.9';
    const config = loadConfig();
    expect(config.dedupThreshold).toBe(0.9);
  });

  it('defaults dedupModel to minishlab/M2V_base_output', () => {
    const config = loadConfig();
    expect(config.dedupModel).toBe('minishlab/M2V_base_output');
  });

  it('parses custom DEDUP_MODEL', () => {
    process.env.DEDUP_MODEL = 'custom/model-v2';
    const config = loadConfig();
    expect(config.dedupModel).toBe('custom/model-v2');
  });

  it('defaults semanticRerank to false', () => {
    const config = loadConfig();
    expect(config.semanticRerank).toBe(false);
  });

  it('parses SEMANTIC_RERANK=true as boolean', () => {
    process.env.SEMANTIC_RERANK = 'true';
    const config = loadConfig();
    expect(config.semanticRerank).toBe(true);
  });

  it('defaults rerankTopK to 5', () => {
    const config = loadConfig();
    expect(config.rerankTopK).toBe(5);
  });

  it('parses RERANK_TOP_K=10', () => {
    process.env.RERANK_TOP_K = '10';
    const config = loadConfig();
    expect(config.rerankTopK).toBe(10);
  });

  it('defaults rerankModel to minishlab/M2V_base_output', () => {
    const config = loadConfig();
    expect(config.rerankModel).toBe('minishlab/M2V_base_output');
  });
});
