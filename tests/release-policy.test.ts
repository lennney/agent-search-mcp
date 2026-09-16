import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  assertCleanWorktree,
  assertPackageFiles,
  checkPackageFiles,
  parsePackFiles,
} from '../scripts/release-policy.mjs';

describe('npm release policy', () => {
  it('rejects tracked and untracked worktree changes', () => {
    expect(() => assertCleanWorktree(' M package.json\n?? prototype/\n')).toThrow(
      /clean Git worktree/,
    );
  });

  it('accepts an empty porcelain status', () => {
    expect(() => assertCleanWorktree('')).not.toThrow();
  });

  it('rejects package files outside the reviewed manifest', () => {
    const expected = JSON.parse(
      readFileSync(new URL('../scripts/npm-package-files.json', import.meta.url), 'utf8'),
    ) as string[];

    expect(() => assertPackageFiles([...expected, 'dist/debug-dump.json'], expected)).toThrow(
      /Unexpected: dist\/debug-dump\.json/,
    );
  });

  it('matches the reviewed npm package manifest', () => {
    expect(() => checkPackageFiles()).not.toThrow();
  }, 15_000);

  it.each(['array', 'keyed object'])('checks package contents from npm pack as a %s', (format) => {
    const expected = ['package.json', 'dist/index.js'];
    const entry = { files: expected.map(path => ({ path })) };
    const result = format === 'array' ? [entry] : { 'agent-search-mcp': entry };
    const actual = parsePackFiles(JSON.stringify(result));

    expect(actual).toEqual(expected);
    expect(() => assertPackageFiles(actual, expected)).not.toThrow();
    expect(() => assertPackageFiles([...actual, 'dist/debug-dump.json'], expected))
      .toThrow(/Unexpected: dist\/debug-dump\.json/);
  });
});
