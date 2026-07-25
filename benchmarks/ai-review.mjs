#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  createOpenAiResponsesJudge,
  runAiAdjudication,
  runAiReview,
} from './lib/ai-review.mjs';

const argv = process.argv.slice(2);

try {
  const reviewPath = optionValue('--review');
  const adjudicatePath = optionValue('--adjudicate');
  if ((reviewPath === undefined) === (adjudicatePath === undefined)) usage();

  const poolPath = reviewPath ?? requiredOption('--pool');
  const outputPath = requiredOption('--output');
  const provider = requiredOption('--provider');
  if (provider !== 'openai') {
    throw new Error('Only --provider openai is currently supported');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const config = {
    reviewerSlot: requiredOption('--reviewer-slot'),
    provider,
    model: requiredOption('--model'),
    modelFamily: requiredOption('--model-family'),
    temperature: 0,
  };
  const pool = await readJson(poolPath);
  const callJudge = createOpenAiResponsesJudge({ apiKey });
  const onProgress = value => writeJson(outputPath, value);

  if (reviewPath !== undefined) {
    await runAiReview(pool, config, callJudge, { onProgress });
    console.error(`Wrote completed AI review to ${resolve(outputPath)}`);
  } else {
    const pending = await readJson(adjudicatePath);
    await runAiAdjudication(pool, pending, config, callJudge, { onProgress });
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
    '  node benchmarks/ai-review.mjs --review pool.json --provider openai --model MODEL --model-family FAMILY --reviewer-slot judge-a --output review.json',
    '  node benchmarks/ai-review.mjs --adjudicate pending.json --pool pool.json --provider openai --model MODEL --model-family FAMILY --reviewer-slot adjudicator --output completed.json',
  ].join('\n'));
}
