#!/usr/bin/env node
import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

await run(npmCommand, ['run', 'build']);
await run(npmCommand, [
  'test',
  '--',
  '--run',
  'tests/e2e/basic-search.e2e.ts',
], {
  RUN_LIVE_NETWORK_E2E: 'true',
});

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
