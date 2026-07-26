#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import {
  parseEngineSelection,
  selectBenchmarkQueries,
} from './lib/capture-options.mjs';
import {
  evaluateRunnerQualification,
  observeSearchFailure,
  observeSearchResponse,
} from './lib/runner-qualification.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const ALL_ENGINES = [
  'duckduckgo', 'sogou', 'bing', 'baidu',
  'wikipedia', 'startpage', 'yandex', 'mojeek',
  'brave', 'tavily', 'exa', 'youcom',
];
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
  const systems = systemSpecs.map(parseSystem);
  const querySet = JSON.parse(await readFile(querySetPath, 'utf8'));
  const limit = integerOption('--limit') ?? 2;
  const queries = selectBenchmarkQueries(querySet, limit);
  const minimumQueries = integerOption('--minimum-queries') ?? limit;

  process.env.OUTPUT_STYLE = 'normal';
  process.env.MAX_FULL_RESULTS = '50';
  process.env.MIN_CONFIDENCE = '0';
  process.env.MIN_SOURCE_COUNT = '1';
  const { searchWithFallback } = await import('../dist/tools/free-search.js');

  const samples = [];
  for (const [queryIndex, item] of queries.entries()) {
    const normalized = typeof item === 'string' ? { query: item } : item;
    const query = normalized.query || normalized.q;
    if (typeof query !== 'string' || query.length === 0) {
      throw new Error(`Query ${queryIndex + 1} has no query/q field`);
    }
    const observations = [];
    for (const system of systems) {
      const startedAt = Date.now();
      try {
        const response = await searchWithFallback({
          query,
          count: 10,
          engines: system.engines,
          waterfall: true,
          minConfidence: 0,
          minSourceCount: 1,
          enrich: false,
          expandQueries: false,
        });
        observations.push({
          system_id: system.system_id,
          ...observeSearchResponse(response, Date.now() - startedAt),
        });
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
  }

  const report = evaluateRunnerQualification({
    query_set_sha256: createHash('sha256')
      .update(JSON.stringify(queries))
      .digest('hex'),
    systems,
    samples,
  }, {
    minimumQueries,
    minimumProviderFamilies: integerOption('--minimum-provider-families') ?? 2,
  });
  const output = {
    ...report,
    observed_at: new Date().toISOString(),
    query_set: relative(ROOT, querySetPath).replaceAll('\\', '/'),
    privacy: {
      retained: [
        'query IDs',
        'candidate-set and ranking hashes',
        'provider families',
        'engine/failure types',
        'counts and durations',
      ],
      omitted: ['query text', 'titles', 'URLs', 'snippets', 'response bodies'],
    },
  };
  await writeJson(outputPath, output);
  console.error(
    `Runner qualification ${report.readiness.status}: `
    + `${report.readiness.qualified_queries}/${report.readiness.observed_queries} queries`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function parseSystem(value) {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error('--system must use system-id=engine,engine');
  }
  return {
    system_id: value.slice(0, separator),
    engines: parseEngineSelection(value.slice(separator + 1), ALL_ENGINES),
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
