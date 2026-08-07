import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildCompetitiveCapturePlan,
  runCompetitiveCapturePlan,
} from '../../benchmarks/lib/competitive-capture.mjs';
import {
  assertPrivateOutputRoot,
  createSubprocessCompetitiveInvoker,
  validateDriverResponse,
} from '../../benchmarks/lib/competitive-driver.mjs';

const queries = Array.from({ length: 30 }, (_, index) => ({
  id: `q-${index + 1}`,
  query: `query ${index + 1}`,
  language: index % 2 === 0 ? 'en' : 'zh',
}));

describe('competitive capture controller', () => {
  it('builds a deterministic Top-5 Latin-square plan with no retries', () => {
    const plan = buildCompetitiveCapturePlan(queries);

    expect(plan.expected_sample_count).toBe(90);
    expect(plan.result_limit).toBe(5);
    expect(plan.delay_ms).toBe(10_000);
    expect(plan.retry_limit).toBe(0);
    expect(plan.calls.every(call => call.result_limit === 5 && call.retry_limit === 0)).toBe(true);
    expect([0, 1, 2].map(queryIndex => plan.calls
      .filter(call => call.query_index === queryIndex)
      .map(call => call.system_id))).toEqual([
      ['agent-search-free-waterfall', 'open-websearch-2.1.9', 'ddgs-9.14.4'],
      ['open-websearch-2.1.9', 'ddgs-9.14.4', 'agent-search-free-waterfall'],
      ['ddgs-9.14.4', 'agent-search-free-waterfall', 'open-websearch-2.1.9'],
    ]);
    expect(plan.systems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'open-websearch-2.1.9',
        version: '2.1.9',
        options: expect.objectContaining({
          engines: [
            'bing', 'baidu', 'csdn', 'duckduckgo', 'exa',
            'brave', 'juejin', 'startpage', 'sogou',
          ],
        }),
      }),
      expect.objectContaining({ id: 'ddgs-9.14.4', version: '9.14.4' }),
    ]));
  });

  it('preserves timeouts but checkpoints and aborts the round on a challenge', async () => {
    const plan = buildCompetitiveCapturePlan(queries.slice(0, 1));
    const invoke = vi.fn()
      .mockResolvedValueOnce({ failure_type: 'timeout' })
      .mockResolvedValueOnce({ failure_type: 'bot_challenge' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const checkpoints: unknown[] = [];

    const state = await runCompetitiveCapturePlan(plan, {
      invoke,
      sleep,
      onCheckpoint: checkpoint => checkpoints.push(checkpoint),
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(10_000);
    expect(state).toMatchObject({
      capture_status: 'aborted',
      completed_sample_count: 2,
      stop_reason: 'bot_challenge',
    });
    expect(checkpoints).toHaveLength(2);
  });

  it('requires raw competitive artifacts to stay outside the repository', () => {
    const repository = resolve('D:/workspace/repository');
    expect(assertPrivateOutputRoot(resolve('D:/workspace/private-captures'), repository))
      .toBe(resolve('D:/workspace/private-captures'));
    expect(() => assertPrivateOutputRoot(resolve('D:/workspace/repository/private'), repository))
      .toThrow(/outside/);
  });

  it('maps a pinned subprocess response once without forwarding ambient secrets', async () => {
    const plan = buildCompetitiveCapturePlan(queries.slice(0, 1));
    const call = plan.calls[0];
    let written = '';
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: new Writable({
        write(chunk, _encoding, callback) {
          written += chunk.toString();
          callback();
        },
      }),
      kill: vi.fn(),
    });
    const spawnImpl = vi.fn(() => {
      queueMicrotask(() => {
        child.stdout.end(JSON.stringify({
          system_version: call.system_version,
          duration_ms: 25,
          results: [{
            title: 'result',
            url: 'https://example.com/result',
            snippet: 'evidence',
          }],
        }));
        child.emit('close', 0);
      });
      return child;
    });
    const invoke = createSubprocessCompetitiveInvoker({
      drivers: new Map([[call.system_id, 'driver.mjs']]),
      spawnImpl,
      timeoutMs: 1000,
    });

    await expect(invoke(call)).resolves.toEqual({
      system_version: call.system_version,
      duration_ms: 25,
      results: [{
        title: 'result',
        url: 'https://example.com/result',
        snippet: 'evidence',
      }],
    });
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [_command, _args, options] = spawnImpl.mock.calls[0];
    expect(options).toMatchObject({ shell: false, windowsHide: true });
    expect(options.env).not.toHaveProperty('OPENAI_API_KEY');
    expect(JSON.parse(written)).toMatchObject({
      kind: 'competitive-search-request',
      expected_system_version: call.system_version,
      result_limit: 5,
    });
  });

  it('rejects version drift and more than five mapped results', () => {
    const call = buildCompetitiveCapturePlan(queries.slice(0, 1)).calls[0];
    expect(() => validateDriverResponse(call, {
      system_version: 'different',
      duration_ms: 1,
      results: [],
    })).toThrow(/unpinned/);
    expect(() => validateDriverResponse(call, {
      system_version: call.system_version,
      duration_ms: 1,
      results: Array.from({ length: 6 }, (_, index) => ({
        title: `${index}`,
        url: `https://example.com/${index}`,
      })),
    })).toThrow(/result limit/);
  });
});
