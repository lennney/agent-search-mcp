import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const RUNNER_PATH = resolve(
  import.meta.dirname,
  '../../scripts/run-live-e2e.mjs',
);

function runLiveRunner(engines: string) {
  const result = spawnSync(process.execPath, [RUNNER_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LIVE_E2E: 'true',
      LIVE_E2E_ENGINES: engines,
    },
  });

  return {
    code: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

describe('live E2E runner validation', () => {
  it.each(['', 'not-an-engine'])(
    'rejects LIVE_E2E_ENGINES=%j before build or network execution',
    (engines) => {
      const result = runLiveRunner(engines);

      expect(result.code).toBe(2);
      expect(result.output).toContain('LIVE_E2E_ENGINES');
      expect(result.output).not.toContain('npm run build');
    },
  );
});
