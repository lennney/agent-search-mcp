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
    
    const config = loadConfig();
    expect(config.mode).toBe('stdio');
    expect(config.port).toBe(3000);
    expect(config.enableCors).toBe(false);
    expect(config.corsOrigin).toBe('*');
    expect(config.useProxy).toBe(false);
    expect(config.defaultEngine).toBe('duckduckgo');
    expect(config.allowedEngines).toEqual([]);
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
});
