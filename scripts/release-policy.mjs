import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const packageFilesManifest = resolve(scriptDirectory, 'npm-package-files.json');

export function assertCleanWorktree(porcelainStatus) {
  if (porcelainStatus.trim().length > 0) {
    throw new Error(
      'npm release requires a clean Git worktree. Commit or remove all tracked '
      + 'and untracked changes before publishing.',
    );
  }
}

export function checkReleaseWorktree() {
  const status = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8' },
  );
  assertCleanWorktree(status);
}

export function assertPackageFiles(actualFiles, expectedFiles) {
  const actual = [...new Set(actualFiles)].sort();
  const expected = [...new Set(expectedFiles)].sort();
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const unexpected = actual.filter(file => !expectedSet.has(file));
  const missing = expected.filter(file => !actualSet.has(file));

  if (unexpected.length > 0 || missing.length > 0) {
    const details = [
      unexpected.length > 0 ? `Unexpected: ${unexpected.join(', ')}` : '',
      missing.length > 0 ? `Missing: ${missing.join(', ')}` : '',
    ].filter(Boolean).join('\n');
    throw new Error(`npm package contents differ from the reviewed manifest.\n${details}`);
  }
}

export function checkPackageFiles() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error('Cannot locate the active npm CLI. Run this check through npm run package:check.');
  }
  const packJson = execFileSync(
    process.execPath,
    [npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  const packResult = JSON.parse(packJson);
  const actualFiles = packResult[0]?.files?.map(file => file.path) ?? [];
  const expectedFiles = JSON.parse(readFileSync(packageFilesManifest, 'utf8'));
  assertPackageFiles(actualFiles, expectedFiles);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const checkWorktree = !process.argv.includes('--package-only');
    const checkPackage = !process.argv.includes('--worktree-only');
    if (checkWorktree) checkReleaseWorktree();
    if (checkPackage) checkPackageFiles();
    process.stdout.write('Requested npm release checks passed.\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
