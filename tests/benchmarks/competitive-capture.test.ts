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
  createCompetitiveDriverEvidence,
  createSubprocessCompetitiveInvoker,
  validateDriverResponse,
} from '../../benchmarks/lib/competitive-driver.mjs';
import {
  assertDirectQualificationTransport,
  assertCompetitiveQualification,
  competitiveProfileSha256,
  createAgentSearchQualificationProfile,
} from '../../benchmarks/lib/competitive-run-contract.mjs';

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
            'bing', 'baidu', 'linuxdo', 'csdn', 'duckduckgo',
            'exa', 'brave', 'juejin', 'startpage',
          ],
          source_commit: '84695b392ca03ffc68fbd406f1d7937b7151e4b6',
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

  it('classifies a subprocess timeout as an ordinary timeout sample', async () => {
    const plan = buildCompetitiveCapturePlan(queries.slice(0, 1));
    const checkpoints: unknown[] = [];

    const state = await runCompetitiveCapturePlan(plan, {
      invoke: vi.fn().mockRejectedValue(new Error('Driver timed out for test-system')),
      sleep: vi.fn().mockResolvedValue(undefined),
      onCheckpoint: checkpoint => checkpoints.push(checkpoint),
    });

    expect(state).toMatchObject({
      capture_status: 'complete',
      completed_sample_count: 3,
      samples: [expect.objectContaining({
        outcome: { failure_type: 'timeout' },
      }), expect.any(Object), expect.any(Object)],
    });
    expect(checkpoints).toHaveLength(4);
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

  it('preserves typed provider attribution without accepting arbitrary text', () => {
    const call = buildCompetitiveCapturePlan(queries.slice(0, 1)).calls[0];
    expect(validateDriverResponse(call, {
      system_version: call.system_version,
      duration_ms: 20,
      failure_type: 'bot_challenge',
      failure_scope: 'provider',
      failure_source: 'duckduckgo',
    })).toEqual({
      system_version: call.system_version,
      duration_ms: 20,
      failure_type: 'bot_challenge',
      failure_scope: 'provider',
      failure_source: 'duckduckgo',
    });
    expect(() => validateDriverResponse(call, {
      system_version: call.system_version,
      duration_ms: 20,
      failure_type: 'bot_challenge',
      failure_scope: 'provider',
      failure_source: 'raw upstream response: secret',
    })).toThrow(/failure attribution/);
  });

  it('requires a fresh ready qualification for the exact formal profile', () => {
    const now = Date.parse('2026-08-08T00:20:00.000Z');
    const profile = createAgentSearchQualificationProfile(
      'agent-search-free-waterfall',
      ['duckduckgo', 'sogou', 'wikipedia'],
      'git:a05ca5e25afaebe149e59a1cb126dd7118ae85dd',
    );
    const report = {
      kind: 'search-runner-qualification',
      capture_status: 'complete',
      observed_at: '2026-08-08T00:10:00.000Z',
      readiness: { status: 'ready' },
      systems: [{
        system_id: 'agent-search-free-waterfall',
        engines: ['duckduckgo', 'sogou', 'wikipedia'],
        profile_sha256: competitiveProfileSha256(profile),
      }],
    };

    expect(assertCompetitiveQualification(report, profile, { now })).toEqual({
      qualification_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      profile_sha256: competitiveProfileSha256(profile),
      observed_at: report.observed_at,
    });
    expect(() => assertCompetitiveQualification(report, {
      ...profile,
      result_limit: 10,
    }, { now })).toThrow(/profile differs/);
    expect(() => assertCompetitiveQualification(
      report,
      createAgentSearchQualificationProfile(
        'agent-search-free-waterfall',
        ['duckduckgo', 'sogou', 'wikipedia'],
        'git:different-revision',
      ),
      { now },
    )).toThrow(/profile differs/);
    expect(() => assertCompetitiveQualification(report, profile, {
      now: Date.parse('2026-08-08T01:00:01.000Z'),
    })).toThrow(/stale/);
  });

  it('requires qualification to use the same direct transport as formal capture', () => {
    expect(assertDirectQualificationTransport([
      { engine: 'duckduckgo', status: 'missing' },
      { engine: 'sogou', status: 'missing' },
    ])).toEqual({ proxy: false });
    expect(() => assertDirectQualificationTransport([
      { engine: 'duckduckgo', status: 'present' },
      { engine: 'sogou', status: 'missing' },
    ])).toThrow(/requires direct/);
  });

  it('hashes the exact driver, configuration, and implementation revision', () => {
    const system = buildCompetitiveCapturePlan(queries.slice(0, 1)).systems[0];
    const evidence = createCompetitiveDriverEvidence(
      system,
      'git:292b23a1d064017648c5d1548f222f4518ec2cf1',
      'driver source',
    );

    expect(evidence).toMatchObject({
      system_version: 'repository-build',
      implementation_revision: 'git:292b23a1d064017648c5d1548f222f4518ec2cf1',
      driver_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      configuration_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
