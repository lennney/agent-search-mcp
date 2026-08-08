#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  parseEngineSelection,
  selectBenchmarkQueries,
} from './lib/capture-options.mjs';
import {
  evaluateRunnerQualification,
  observeSearchFailure,
  observeSearchResponse,
  qualificationQueryDelayMs,
  runnerQualificationExitCode,
  terminalQualificationFailure,
} from './lib/runner-qualification.mjs';
import {
  assertDirectQualificationTransport,
  competitiveProfileSha256,
  createAgentSearchQualificationProfile,
} from './lib/competitive-run-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);

try {
  const querySetPath = resolve(
    ROOT,
    optionValue('--query-set') ?? 'benchmarks/queries/routing-calibration.json',
  );
  const outputPath = requiredOption('--output');
  const systemSpecs = optionValues('--system');
  if (systemSpecs.length < 2) {
    throw new Error('at least two --system id=engine,engine definitions are required');
  }
  const querySet = JSON.parse(await readFile(querySetPath, 'utf8'));
  const limit = integerOption('--limit') ?? 2;
  const queries = selectBenchmarkQueries(querySet, limit);
  const minimumQueries = integerOption('--minimum-queries') ?? limit;
  const queryDelayMs = qualificationQueryDelayMs(optionValue('--query-delay-ms'));
  const implementationRevision = requiredOption('--implementation-revision');

  process.env.OUTPUT_STYLE = 'normal';
  process.env.MAX_FULL_RESULTS = '50';
  process.env.MIN_CONFIDENCE = '0';
  process.env.MIN_SOURCE_COUNT = '1';
  const [
    { searchWithFallback },
    { SEARCH_PROVIDERS },
    { inspectEngineProxyConfiguration },
  ] = await Promise.all([
    import('../dist/tools/free-search.js'),
    import('../dist/engines/provider-catalog.js'),
    import('../dist/infrastructure/engine-http.js'),
  ]);
  assertDirectQualificationTransport([
    {
      engine: 'duckduckgo',
      ...inspectEngineProxyConfiguration('duckduckgo'),
    },
    {
      engine: 'sogou',
      ...inspectEngineProxyConfiguration('sogou'),
    },
  ]);
  const systems = systemSpecs.map(value => parseSystem(value, SEARCH_PROVIDERS));

  const samples = [];
  let stopReason = null;
  for (const [queryIndex, item] of queries.entries()) {
    const normalized = typeof item === 'string' ? { query: item } : item;
    const query = normalized.query || normalized.q;
    if (typeof query !== 'string' || query.length === 0) {
      throw new Error(`Query ${queryIndex + 1} has no query/q field`);
    }
    const observations = [];
    for (const [systemIndex, system] of systems.entries()) {
      const startedAt = Date.now();
      try {
        const response = await searchWithFallback({
          query,
          count: 5,
          engines: system.engines,
          waterfall: true,
          minConfidence: 0,
          minSourceCount: 1,
          enrich: false,
          expandQueries: false,
          providerMaxRetries: 0,
        });
        const observation = {
          system_id: system.system_id,
          ...observeSearchResponse(response, Date.now() - startedAt),
        };
        observations.push(observation);
        stopReason = terminalQualificationFailure(observation);
        if (stopReason) {
          for (const skipped of systems.slice(systemIndex + 1)) {
            observations.push({
              system_id: skipped.system_id,
              status: 'failed',
              duration_ms: 0,
              result_count: 0,
              result_ids: [],
              provider_families: [],
              searched_engines: [],
              partial_failures: [],
              error_type: 'AbortedAfterTerminalFailure',
            });
          }
          break;
        }
      } catch (error) {
        observations.push({
          system_id: system.system_id,
          ...observeSearchFailure(error, Date.now() - startedAt),
        });
      }
    }
    samples.push({
      id: normalized.id || `q${queryIndex + 1}`,
      systems: observations,
    });
    if (stopReason) break;
    if (queryIndex < queries.length - 1) await delay(queryDelayMs);
  }

  const report = evaluateRunnerQualification({
    query_set_sha256: createHash('sha256')
      .update(JSON.stringify(queries))
      .digest('hex'),
    systems: systems.map(system => ({
      ...system,
      profile_sha256: competitiveProfileSha256(
        createAgentSearchQualificationProfile(
          system.system_id,
          system.engines,
          implementationRevision,
        ),
      ),
    })),
    samples,
  }, {
    minimumQueries,
    minimumProviderFamilies: integerOption('--minimum-provider-families') ?? 2,
  });
  const output = {
    ...report,
    capture_status: stopReason ? 'aborted' : 'complete',
    ...(stopReason && { stop_reason: stopReason }),
    observed_at: new Date().toISOString(),
    query_set: relative(ROOT, querySetPath).replaceAll('\\', '/'),
    privacy: {
      retained: [
        'query IDs',
        'candidate-set and ranking hashes',
        'provider families',
        'engine/failure types',
        'formal profile hashes',
        'counts and durations',
      ],
      omitted: ['query text', 'titles', 'URLs', 'snippets', 'response bodies'],
    },
    probe_policy: {
      query_delay_ms: queryDelayMs,
      no_automatic_retry: true,
    },
  };
  await writeJson(outputPath, output);
  console.error(
    `Runner qualification ${report.readiness.status}: `
    + `${report.readiness.qualified_queries}/${report.readiness.observed_queries} queries`,
  );
  process.exitCode = stopReason ? 2 : runnerQualificationExitCode(report);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function parseSystem(value, availableEngines) {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error('--system must use system-id=engine,engine');
  }
  return {
    system_id: value.slice(0, separator),
    engines: parseEngineSelection(value.slice(separator + 1), availableEngines),
  };
}

function optionValues(name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${name} requires a value`);
    }
    values.push(value);
    index += 1;
  }
  return values;
}

function optionValue(name) {
  const values = optionValues(name);
  if (values.length > 1) throw new Error(`${name} may only be provided once`);
  return values[0];
}

function requiredOption(name) {
  const value = optionValue(name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

function integerOption(name) {
  const raw = optionValue(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function writeJson(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
