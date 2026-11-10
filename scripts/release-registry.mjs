import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertReleaseTag(version, ref) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
      || ref !== `refs/tags/v${version}`) {
    throw new Error('Release tag must exactly match package.json version (v<version>).');
  }
}

export function classifyRegistryResult(result, version) {
  if (result.error || result.signal || !Number.isInteger(result.status)) {
    throw new Error('npm registry request did not complete; refusing publication.');
  }
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw new Error('npm registry returned invalid JSON; refusing publication.');
  }
  if (result.status === 0 && response === version) return true;
  // Only npm's structured "exact version missing" response is absence. A missing
  // package, auth failure, proxy 404, network error or malformed result is not.
  if (result.status !== 0 && response?.error?.code === 'E404'
      && response.error.summary === `No match found for version ${version}`) return false;
  throw new Error('npm registry result is not an exact version or expected absence; refusing publication.');
}

export function checkRegistryVersion(name, version, run = spawnSync) {
  const result = run('npm', [
    'view', `${name}@${version}`, 'version', '--json',
    '--registry=https://registry.npmjs.org/',
  ], { encoding: 'utf8', timeout: 60_000 });
  return classifyRegistryResult(result, version);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
    assertReleaseTag(version, process.env.GITHUB_REF);
    const published = checkRegistryVersion(name, version);
    if (process.argv.includes('--require-published') && !published) {
      throw new Error('Exact npm version is not yet visible; downstream publication blocked.');
    }
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `already_published=${published}\n`);
    }
    process.stdout.write(`Exact npm version ${name}@${version}: ${published ? 'published' : 'absent'}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
