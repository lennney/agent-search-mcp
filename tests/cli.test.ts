import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('parseArgs', () => {
  it('parses search command', () => {
    const args = parseArgs(['node', 'cli.ts', 'search', 'TypeScript MCP']);
    expect(args.command).toBe('search');
    expect(args.query).toBe('TypeScript MCP');
  });

  it('parses search with options', () => {
    const args = parseArgs(['node', 'cli.ts', 'search', 'query', '--count', '5', '--engines', 'bing,baidu']);
    expect(args.command).toBe('search');
    expect(args.query).toBe('query');
    expect(args.count).toBe(5);
    expect(args.engines).toEqual(['bing', 'baidu']);
  });

  it('parses extract command', () => {
    const args = parseArgs(['node', 'cli.ts', 'extract', 'https://example.com']);
    expect(args.command).toBe('extract');
    expect(args.url).toBe('https://example.com');
  });

  it('parses serve command', () => {
    const args = parseArgs(['node', 'cli.ts', 'serve', '--port', '8080']);
    expect(args.command).toBe('serve');
    expect(args.port).toBe(8080);
  });

  it('defaults to search command', () => {
    const args = parseArgs(['node', 'cli.ts', 'TypeScript MCP']);
    expect(args.command).toBe('search');
    expect(args.query).toBe('TypeScript MCP');
  });

  it('parses --json flag', () => {
    const args = parseArgs(['node', 'cli.ts', 'search', 'query', '--json']);
    expect(args.json).toBe(true);
  });

  it('parses --help flag', () => {
    const args = parseArgs(['node', 'cli.ts', '--help']);
    expect(args.help).toBe(true);
  });

  it('no args returns help=true', () => {
    const args = parseArgs(['node', 'cli.ts']);
    expect(args.help).toBe(true);
  });

  it('filters invalid engines', () => {
    const args = parseArgs(['node', 'cli.ts', 'search', 'query', '--engines', 'bing,invalid,baidu']);
    expect(args.engines).toEqual(['bing', 'baidu']);
  });

  it('parses --proxy flag', () => {
    const args = parseArgs(['node', 'cli.ts', 'search', 'query', '--proxy', 'http://127.0.0.1:7890']);
    expect(args.proxy).toBe('http://127.0.0.1:7890');
  });

  it('parses --version flag', () => {
    const args = parseArgs(['node', 'cli.ts', '--version']);
    expect(args.version).toBe(true);
  });
});
