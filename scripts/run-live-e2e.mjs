#!/usr/bin/env node
import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;
const npmCommand = process.platform === 'win32' && npmCli
  ? process.execPath
  : 'npm';
const npmArgsPrefix = process.platform === 'win32' && npmCli
  ? [npmCli]
  : [];
if (process.env.LIVE_E2E !== 'true') {
  console.error(
    'Live E2E is disabled. Set LIVE_E2E=true to authorize the bounded network smoke.',
  );
  process.exit(2);
}

const LIVE_ENGINE_NAMES = ['duckduckgo', 'bing', 'baidu', 'yandex'];
validateEngineSelection(process.env.LIVE_E2E_ENGINES);

const maxRequests = boundedInteger('LIVE_E2E_MAX_REQUESTS', 5, 1, 5);
const minIntervalMs = boundedInteger(
  'LIVE_E2E_MIN_INTERVAL_MS',
  10_000,
  1_000,
  60_000,
);

await run(npmCommand, [...npmArgsPrefix, 'run', 'build']);
await run(npmCommand, [
  ...npmArgsPrefix,
  'test',
  '--',
  '--run',
  'tests/e2e/basic-search.e2e.ts',
], {
  RUN_LIVE_NETWORK_E2E: 'true',
  LIVE_E2E_MAX_REQUESTS: String(maxRequests),
  LIVE_E2E_MIN_INTERVAL_MS: String(minIntervalMs),
});

function boundedInteger(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

function validateEngineSelection(rawValue) {
  if (rawValue === undefined) return;
  const engines = rawValue.split(',').map(engine => engine.trim());
  if (engines.length === 0 || engines.some(engine => !LIVE_ENGINE_NAMES.includes(engine))) {
    console.error(
      `LIVE_E2E_ENGINES must contain one or more supported engines: ${LIVE_ENGINE_NAMES.join(', ')}`,
    );
    process.exit(2);
  }
}

function run(command, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...environment,
      },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
