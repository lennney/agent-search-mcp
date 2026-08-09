#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  createOpenAiResponsesJudge,
  runAiAdjudication,
  runAiReview,
  runAiSchemaSmoke,
} from './lib/ai-review.mjs';
import { competitiveAiProfile } from './lib/competitive-ai-policy.mjs';

const argv = process.argv.slice(2);

try {
  const reviewPath = optionValue('--review');
  const adjudicatePath = optionValue('--adjudicate');
  const schemaSmoke = argv.includes('--schema-smoke');
  const selectedModes = [reviewPath !== undefined, adjudicatePath !== undefined, schemaSmoke]
    .filter(Boolean).length;
  if (selectedModes !== 1) usage();

  const poolPath = schemaSmoke ? null : reviewPath ?? requiredOption('--pool');
  const outputPath = requiredOption('--output');
  const profileName = optionValue('--profile');
  const profile = profileName === undefined ? null : competitiveAiProfile(profileName);
  const provider = profile?.provider ?? requiredOption('--provider');
  if (provider !== 'openai') {
    throw new Error('Only --provider openai is currently supported');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const config = profile ?? {
    reviewerSlot: requiredOption('--reviewer-slot'),
    provider,
    model: requiredOption('--model'),
    modelFamily: requiredOption('--model-family'),
    temperature: 0,
  };
  const pool = poolPath === null ? null : await readJson(poolPath);
  const resumePath = optionValue('--resume');
  const resumePacket = resumePath === undefined ? undefined : await readJson(resumePath);
  const callJudge = createOpenAiResponsesJudge({ apiKey });
  const onProgress = value => writeJson(outputPath, value);

  if (schemaSmoke) {
    if (resumePacket !== undefined) throw new Error('--resume is not valid for schema smoke');
    await writeJson(outputPath, await runAiSchemaSmoke(config, callJudge));
    console.error(`Wrote completed AI schema smoke to ${resolve(outputPath)}`);
  } else if (reviewPath !== undefined) {
    await runAiReview(pool, config, callJudge, { onProgress, resumePacket });
    console.error(`Wrote completed AI review to ${resolve(outputPath)}`);
  } else {
    const pending = await readJson(adjudicatePath);
    await runAiAdjudication(pool, pending, config, callJudge, { onProgress, resumePacket });
    console.error(`Wrote completed AI adjudication to ${resolve(outputPath)}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function optionValues(name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${name} requires a value`);
      }
      values.push(value);
      index += 1;
    }
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

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function writeJson(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function usage() {
  throw new Error([
    'Usage:',
    '  node benchmarks/ai-review.mjs --schema-smoke --profile judge-a --output smoke.json',
    '  node benchmarks/ai-review.mjs --review pool.json --profile judge-a --output review.json [--resume review.json]',
    '  node benchmarks/ai-review.mjs --adjudicate pending.json --pool pool.json --profile adjudicator --output completed.json [--resume completed.json]',
    '  Profiles: judge-a, judge-b, adjudicator. Explicit --provider/--model/--model-family/--reviewer-slot remains supported.',
  ].join('\n'));
}
