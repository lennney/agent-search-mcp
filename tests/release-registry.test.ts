import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { assertReleaseTag, checkRegistryVersion, classifyRegistryResult } from '../scripts/release-registry.mjs';

const version = '3.2.1';
const absent = { status: 1, stdout: JSON.stringify({ error: { code: 'E404', summary: `No match found for version ${version}` } }) };

describe('release registry fail-closed policy (offline)', () => {
  it('asks for the package manifest name at the exact version', () => {
    const run = vi.fn(() => ({ status: 0, stdout: JSON.stringify(version) }));
    expect(checkRegistryVersion('@example/search', version, run)).toBe(true);
    expect(run).toHaveBeenCalledWith('npm', ['view', `@example/search@${version}`, 'version', '--json', '--registry=https://registry.npmjs.org/'], { encoding: 'utf8', timeout: 60_000 });
  });
  it('accepts only the expected structured missing-version response', () => {
    expect(classifyRegistryResult(absent, version)).toBe(false);
  });
  it.each([
    { status: 0, stdout: JSON.stringify('3.2.0') },
    { status: 0, stdout: JSON.stringify([version]) },
    { status: 0, stdout: '' },
    { status: 1, stdout: '' },
    { status: 1, stdout: '<html>404</html>' },
    { status: 1, stdout: JSON.stringify({ error: { code: 'E404', summary: '404 Not Found - package' } }) },
    { status: 1, stdout: JSON.stringify({ error: { code: 'E404', summary: 'No match found for version 9.9.9' } }) },
    ...['E401', 'E403', 'E429', 'E500', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'].map(code => ({ status: 1, stdout: JSON.stringify({ error: { code, summary: `No match found for version ${version}` } }) })),
    { ...absent, error: new Error('timeout') },
    { ...absent, signal: 'SIGTERM' },
    { ...absent, status: null },
  ])('blocks unexpected registry outcome %#', result => {
    expect(() => classifyRegistryResult(result, version)).toThrow(/refusing publication/);
  });
  it('requires an exact version tag rather than a branch, prefix or different version', () => {
    expect(() => assertReleaseTag(version, `refs/tags/v${version}`)).not.toThrow();
    for (const ref of [undefined, 'refs/heads/main', 'refs/tags/v3.2.10', 'refs/tags/v3.2.0', 'refs/tags/3.2.1']) {
      expect(() => assertReleaseTag(version, ref)).toThrow(/exactly match/);
    }
  });
});

describe('release workflow dependency contract', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const jobs = workflow.jobs;
  const commands = (job: string) => jobs[job].steps.map((step: { run?: string }) => step.run).filter(Boolean);
  it('tests the complete stable suite on Linux and Windows across supported lanes', () => {
    for (const job of ['build-and-test', 'windows-build']) {
      expect(jobs[job].strategy.matrix['node-version']).toEqual([18, 20, 22, 24]);
      expect(commands(job)).toContain('npm run build');
      expect(commands(job)).toContain('npm test');
      expect(jobs[job]['continue-on-error']).toBeUndefined();
    }
    expect(jobs['build-and-test']['runs-on']).toBe('ubuntu-latest');
    expect(jobs['windows-build']['runs-on']).toBe('windows-latest');
    expect(commands('quality')).toContain('npm run lint');
    expect(jobs['experimental-2026'].strategy.matrix['node-version']).toEqual([20, 22, 24]);
    expect(commands('experimental-2026')).toContain('npm run experimental:2026:test');
  });
  it('orders every release side effect after all required checks with default success semantics', () => {
    expect(jobs['release-preflight'].needs).toEqual(['build-and-test', 'quality', 'windows-build', 'experimental-2026']);
    expect(jobs['release-preflight'].if).toBe("github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')");
    expect(commands('release-preflight')).toContain('node scripts/release-registry.mjs');
    for (const [job, dependency] of [['publish', 'release-preflight'], ['docker', 'publish'], ['github-release', 'docker']]) {
      expect(jobs[job].needs).toEqual([dependency]);
      expect(jobs[job].if).toBeUndefined();
      expect(jobs[job]['continue-on-error']).toBeUndefined();
    }
    expect(commands('publish').at(-1)).toBe('node scripts/release-registry.mjs --require-published');
    expect(jobs.publish.steps.find((step: { run?: string }) => step.run === 'npm publish').if)
      .toBe("needs.release-preflight.outputs.already_published == 'false'");
  });
  it('has no alternate dispatch publication path or moving Docker latest tag', () => {
    for (const file of readdirSync(new URL('../.github/workflows/', import.meta.url))) {
      if (!/\.ya?ml$/.test(file)) continue;
      const text = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
      const other = parse(text);
      expect(other.on.workflow_dispatch).toBeUndefined();
      if (file !== 'ci.yml') expect(text).not.toMatch(/npm publish|push: true|action-gh-release/);
    }
    const tags = commands('docker').join('\n');
    expect(tags).toContain('${GITHUB_REF_NAME}');
    expect(tags).not.toContain(':latest');
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });
});
