#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  buildCompetitiveCapturePlan,
  runCompetitiveCapturePlan,
} from './lib/competitive-capture.mjs';
import {
  assertPrivateOutputRoot,
  createCompetitiveDriverEvidence,
  createSubprocessCompetitiveInvoker,
} from './lib/competitive-driver.mjs';
import { validateCompetitiveQuerySet } from './lib/competitive-query-set.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const querySetPath = resolve(option('--query-set')
  ?? 'benchmarks/queries/competitive-comparison-v1.json');

try {
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) {
    throw new Error('Select exactly one of --dry-run or --execute');
  }
  const querySet = JSON.parse(await readFile(querySetPath, 'utf8'));
  const validation = validateCompetitiveQuerySet(querySet);
  const plan = buildCompetitiveCapturePlan(querySet);

  if (dryRun) {
    console.log(JSON.stringify({
      dry_run: true,
      query_set: querySetPath,
      query_set_sha256: validation.query_set_sha256,
      systems: plan.systems,
      expected_sample_count: plan.expected_sample_count,
      result_limit: plan.result_limit,
      delay_ms: plan.delay_ms,
      retry_limit: plan.retry_limit,
      latin_square_first_three: [0, 1, 2].map(queryIndex =>
        plan.calls.filter(call => call.query_index === queryIndex).map(call => call.system_id)),
    }, null, 2));
  } else {
    const outputRoot = assertPrivateOutputRoot(
      resolve(requiredOption('--output-root')),
      ROOT,
    );
    const drivers = mappedOptions('--driver');
    const licenses = mappedOptions('--content-license');
    const revisions = mappedOptions('--implementation-revision');
    for (const system of plan.systems) {
      if (!drivers.has(system.id) || !licenses.has(system.id) || !revisions.has(system.id)) {
        throw new Error(
          `--execute requires a driver, content license, and implementation revision for ${system.id}`,
        );
      }
    }
    const runtimeEvidence = Object.fromEntries(await Promise.all(
      plan.systems.map(async system => [
        system.id,
        createCompetitiveDriverEvidence(
          system,
          revisions.get(system.id),
          await readFile(resolve(drivers.get(system.id))),
        ),
      ]),
    ));
    await mkdir(outputRoot, { recursive: true });
    const capturedAt = new Date().toISOString();
    const checkpointPath = join(outputRoot, 'competitive-capture.checkpoint.json');
    const state = await runCompetitiveCapturePlan(plan, {
      invoke: createSubprocessCompetitiveInvoker({ drivers }),
      onCheckpoint: checkpoint => writeJson(checkpointPath, {
        ...checkpoint,
        captured_at: capturedAt,
        query_set_sha256: validation.query_set_sha256,
        runtime_evidence: runtimeEvidence,
      }),
    });
    if (state.capture_status !== 'complete') {
      console.error(`Capture ${state.capture_status}; checkpoint retained at ${checkpointPath}`);
      process.exitCode = 2;
    } else {
      for (const system of plan.systems) {
        const samples = querySet.queries.map(query => {
          const completed = state.samples.find(sample =>
            sample.sample_id === query.id && sample.system_id === system.id);
          return { id: query.id, ...completed.outcome };
        });
        await writeJson(join(outputRoot, `${system.id}.raw.json`), {
          schema_version: 1,
          kind: 'external-search-results',
          captured_at: capturedAt,
          system: { id: system.id, version: system.version },
          result_limit: plan.result_limit,
          configuration: {
            ...system.options,
            runtime_evidence: runtimeEvidence[system.id],
          },
          content_licenses: {
            [system.id]: { license: licenses.get(system.id) },
          },
          samples,
        });
      }
      console.error(`Wrote private raw exports under ${outputRoot}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function optionValues(name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    values.push(value);
    index += 1;
  }
  return values;
}

function option(name) {
  const values = optionValues(name);
  if (values.length > 1) throw new Error(`${name} may only be supplied once`);
  return values[0];
}

function requiredOption(name) {
  const value = option(name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

function mappedOptions(name) {
  const result = new Map();
  for (const value of optionValues(name)) {
    const separator = value.indexOf('=');
    if (separator <= 0 || separator === value.length - 1) {
      throw new Error(`${name} must use system-id=value`);
    }
    const key = value.slice(0, separator);
    if (result.has(key)) throw new Error(`${name} duplicates ${key}`);
    result.set(key, value.slice(separator + 1));
  }
  return result;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
