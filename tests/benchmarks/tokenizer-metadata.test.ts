import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tokenizer = `gpt-tokenizer@${require('gpt-tokenizer/package.json').version}`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frozenFixture = join(root, 'benchmarks/fixtures/format-regression.json');

// Like the server E2E tests, these CLI regressions require `npm run build` first.
// CI builds before running tests. Every invocation below uses synthetic fixtures only.
describe.skipIf(!existsSync(join(root, 'dist/aggregation/format.js')))('benchmark tokenizer metadata', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'benchmark-tokenizer-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function run(...args: string[]) {
    return execFileSync(process.execPath, [join(root, 'benchmarks/run.mjs'), ...args], {
      cwd: directory,
      encoding: 'utf8',
      // Never inherit provider credentials or runtime flags from the test environment.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: directory },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  function read(path: string) {
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  function legacyFixture() {
    const fixture = read(frozenFixture);
    fixture.tokenizer = 'gpt-tokenizer@0.0.0';
    fixture.expected_summary.tokenizer = fixture.tokenizer;
    const path = join(directory, 'legacy.json');
    writeFileSync(path, JSON.stringify(fixture));
    return path;
  }

  it('labels new synthetic fixtures with the installed tokenizer', () => {
    const fixturePath = join(directory, 'generated.json');
    run('--generate-format-fixture', fixturePath);
    expect(read(fixturePath).tokenizer).toBe(tokenizer);
  });

  it('labels replays with the installed tokenizer, not the capture tokenizer', () => {
    const fixturePath = legacyFixture();
    const original = readFileSync(fixturePath, 'utf8');
    const reportPath = join(directory, 'replay.json');
    run('--fixture', fixturePath, '--output', reportPath);
    expect(read(reportPath).summary.tokenizer).toBe(tokenizer);
    expect(readFileSync(fixturePath, 'utf8')).toBe(original);
  });

  it('rejects stale expected metadata, then refreshes it without rewriting capture identity', () => {
    const fixturePath = legacyFixture();
    expect(() => run('--fixture', fixturePath, '--check')).toThrow(/Benchmark drift detected/);
    run('--fixture', fixturePath, '--update-expected');
    const updated = read(fixturePath);
    expect(updated.tokenizer).toBe('gpt-tokenizer@0.0.0');
    expect(updated.expected_summary.tokenizer).toBe(tokenizer);
    expect(run('--fixture', fixturePath, '--check')).toContain('matches expected_summary');
  });
});
