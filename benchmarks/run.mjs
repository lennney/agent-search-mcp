#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { encode } from 'gpt-tokenizer';

const ROOT = resolve(import.meta.dirname, '..');
const ALL_ENGINES = [
  'duckduckgo', 'sogou', 'bing', 'baidu',
  'wikipedia', 'startpage', 'yandex', 'mojeek',
  'brave', 'tavily', 'exa', 'youcom',
];
const ZERO_KEY_ENGINE_COUNT = 8;
const OPTIONAL_KEY_ENV = ['BRAVE_API_KEY', 'TAVILY_API_KEY', 'EXA_API_KEY', 'YDC_API_KEY'];
const SCENARIOS = {
  normal: { style: 'normal', snippetMax: 200 },
  compact: { style: 'compact', snippetMax: 200, maxFullResults: 3 },
  compact_aggressive: { style: 'compact', snippetMax: 120, maxFullResults: 3 },
};

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function tokenCount(value) {
  return encode(JSON.stringify(value)).length;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function capture(fixturePath) {
  process.env.OUTPUT_STYLE = 'normal';
  process.env.MAX_FULL_RESULTS = '50';
  process.env.MIN_CONFIDENCE = '0';
  process.env.MIN_SOURCE_COUNT = '1';

  const [{ searchWithFallback }, packageJson, querySet] = await Promise.all([
    import('../dist/tools/free-search.js'),
    readJson(resolve(ROOT, 'package.json')),
    readJson(resolve(ROOT, 'benchmarks/queries.json')),
  ]);
  const allQueries = Array.isArray(querySet) ? querySet : querySet.queries;
  const requestedLimit = Number.parseInt(option('--limit') || String(allQueries?.length || 0), 10);
  const english = allQueries?.filter(item => (item.language || item.lang) !== 'zh') || [];
  const chinese = allQueries?.filter(item => (item.language || item.lang) === 'zh') || [];
  const englishLimit = Math.ceil(requestedLimit / 2);
  const queries = requestedLimit < (allQueries?.length || 0)
    ? [...english.slice(0, englishLimit), ...chinese.slice(0, requestedLimit - englishLimit)]
    : allQueries;
  if (!Array.isArray(queries)) throw new Error('benchmarks/queries.json must contain an array');

  const samples = [];
  const fixture = {
    schema_version: 1,
    kind: 'live-capture',
    captured_at: new Date().toISOString(),
    package_version: packageJson.version,
    query_set_sha256: sha256(JSON.stringify(queries)),
    tokenizer: 'gpt-tokenizer@3.4.0',
    zero_key_engine_baseline: ZERO_KEY_ENGINE_COUNT,
    naive_engine_baseline: ZERO_KEY_ENGINE_COUNT + OPTIONAL_KEY_ENV.filter(name => process.env[name]).length,
    samples,
  };
  for (let index = 0; index < queries.length; index++) {
    const item = typeof queries[index] === 'string' ? { query: queries[index] } : queries[index];
    const query = item.query || item.q;
    if (!query) throw new Error(`Query ${index + 1} has no query/q field`);
    const startedAt = Date.now();
    try {
      const response = await searchWithFallback({
        query,
        count: 10,
        engines: ALL_ENGINES,
        waterfall: true,
        minConfidence: 0,
        minSourceCount: 1,
        enrich: false,
        expandQueries: false,
      });
      samples.push({
        id: item.id || `q${index + 1}`,
        query,
        language: item.language || item.lang || 'unknown',
        duration_ms: Date.now() - startedAt,
        response,
      });
      console.log(`[${index + 1}/${queries.length}] ${query} — ${response.results.length} results, ${response.meta.execution?.engine_calls ?? 0} calls`);
    } catch (error) {
      samples.push({
        id: item.id || `q${index + 1}`,
        query,
        language: item.language || item.lang || 'unknown',
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[${index + 1}/${queries.length}] ${query} — failed`);
    }
    // Checkpoint after every query so an interrupted live run remains inspectable.
    await writeJson(fixturePath, fixture);
  }
  console.log(`Captured ${samples.length} samples to ${fixturePath}`);
}

async function generateFormatFixture(fixturePath) {
  const querySet = await readJson(resolve(ROOT, 'benchmarks/queries.json'));
  const selected = [
    ...querySet.filter(item => item.lang === 'en').slice(0, 5),
    ...querySet.filter(item => item.lang === 'zh').slice(0, 5),
  ];
  const samples = selected.map((item, queryIndex) => {
    const results = Array.from({ length: 10 }, (_, resultIndex) => {
      const sources = resultIndex % 4 === 0
        ? ['duckduckgo', 'wikipedia']
        : [resultIndex % 2 === 0 ? 'sogou' : 'duckduckgo'];
      const suffix = item.lang === 'zh'
        ? `这是关于“${item.q}”的冻结基准摘要，用于验证渐进披露、字段语义和中文 Token 计算在不同环境中保持一致。结果编号 ${resultIndex + 1}。`
        : `Frozen benchmark summary about “${item.q}”, used to verify progressive disclosure, field semantics, and token counts across environments. Result ${resultIndex + 1}.`;
      return {
        title: `${item.q} — ${item.lang === 'zh' ? '参考结果' : 'Reference result'} ${resultIndex + 1}`,
        url: `https://benchmark.example/${queryIndex + 1}/${resultIndex + 1}`,
        snippet: `${suffix} ${suffix}`,
        confidence: round(0.94 - resultIndex * 0.035, 3),
        relevance: round(0.91 - resultIndex * 0.04, 3),
        source_count: sources.length,
        sources,
      };
    });
    return {
      id: `format-${queryIndex + 1}`,
      query: item.q,
      language: item.lang,
      duration_ms: 0,
      response: {
        query: item.q,
        engines: ALL_ENGINES.slice(0, ZERO_KEY_ENGINE_COUNT),
        results,
        meta: {
          total: results.length,
          high_confidence: results.filter(result => result.confidence >= 0.8).length,
          engines: [...new Set(results.flatMap(result => result.sources))],
        },
        security_note: 'Frozen format-regression fixture; content is synthetic and contains no search-quality claim.',
      },
    };
  });
  await writeJson(fixturePath, {
    schema_version: 1,
    kind: 'format-regression',
    captured_at: new Date().toISOString(),
    package_version: (await readJson(resolve(ROOT, 'package.json'))).version,
    query_set_sha256: sha256(JSON.stringify(selected)),
    tokenizer: 'gpt-tokenizer@3.4.0',
    zero_key_engine_baseline: ZERO_KEY_ENGINE_COUNT,
    naive_engine_baseline: ZERO_KEY_ENGINE_COUNT,
    samples,
  });
  console.log(`Generated deterministic format fixture at ${fixturePath}`);
}

function toScoredResult(result) {
  const sources = result.sources || ['unknown'];
  const relevance = result.relevance ?? 0;
  return {
    title: result.title,
    url: result.url,
    snippet: result.snippet || '',
    source: sources[0] || 'unknown',
    engines: sources,
    confidence: result.confidence ?? 0,
    relevance,
    source_count: result.source_count ?? sources.length,
    score: relevance,
  };
}

async function replay(fixturePath, outputPath, check) {
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  const { formatResults } = await import('../dist/aggregation/format.js');
  const successful = fixture.samples.filter(sample => sample.response?.results?.length > 0);
  if (successful.length === 0) throw new Error('Fixture contains no successful samples');

  const scenarioRows = {};
  for (const [name, formatOptions] of Object.entries(SCENARIOS)) {
    scenarioRows[name] = successful.map(sample => {
      const scored = sample.response.results.map(toScoredResult);
      const formatted = formatResults(scored, formatOptions);
      const payload = {
        query: sample.query,
        engines: sample.response.engines,
        results: formatted.results,
        meta: {
          ...formatted.meta,
          execution: sample.response.meta.execution,
        },
        security_note: formatted.security_note,
      };
      return { id: sample.id, tokens: tokenCount(payload) };
    });
  }

  const average = rows => round(rows.reduce((sum, row) => sum + row.tokens, 0) / rows.length, 2);
  const normalTokens = average(scenarioRows.normal);
  const compactTokens = average(scenarioRows.compact);
  const aggressiveTokens = average(scenarioRows.compact_aggressive);
  const engineCalls = successful
    .map(sample => sample.response.meta.execution?.engine_calls)
    .filter(count => Number.isFinite(count));
  const avgEngineCalls = engineCalls.length > 0
    ? round(engineCalls.reduce((sum, count) => sum + count, 0) / engineCalls.length, 2)
    : null;
  const naiveEngineBaseline = fixture.naive_engine_baseline || fixture.zero_key_engine_baseline;

  const summary = {
    successful_queries: successful.length,
    tokenizer: fixture.tokenizer,
    average_tokens: {
      normal: normalTokens,
      compact: compactTokens,
      compact_aggressive: aggressiveTokens,
    },
    savings_percent: {
      compact: round((1 - compactTokens / normalTokens) * 100),
      compact_aggressive: round((1 - aggressiveTokens / normalTokens) * 100),
      waterfall_engine_calls: avgEngineCalls === null
        ? null
        : round((1 - avgEngineCalls / naiveEngineBaseline) * 100),
    },
    average_engine_calls: avgEngineCalls,
  };

  const report = {
    schema_version: 1,
    fixture: relative(ROOT, fixturePath).replaceAll('\\', '/'),
    fixture_sha256: sha256(fixtureText),
    generated_at: new Date().toISOString(),
    scenarios: SCENARIOS,
    summary,
    per_query: scenarioRows,
  };

  if (check) {
    const expected = fixture.expected_summary;
    if (!expected) throw new Error('Fixture has no expected_summary; run with --update-expected first');
    if (JSON.stringify(expected) !== JSON.stringify(summary)) {
      throw new Error(`Benchmark drift detected.\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(summary)}`);
    }
    console.log('Benchmark replay matches expected_summary');
  } else if (process.argv.includes('--update-expected')) {
    fixture.expected_summary = summary;
    await writeJson(fixturePath, fixture);
    console.log(`Updated expected_summary in ${fixturePath}`);
  }

  if (outputPath) await writeJson(outputPath, report);
  console.log(JSON.stringify(summary, null, 2));
}

const capturePath = option('--capture');
const generatedFixturePath = option('--generate-format-fixture');
const fixturePath = resolve(ROOT, option('--fixture') || 'benchmarks/fixtures/latest.json');
const outputPath = option('--output') ? resolve(ROOT, option('--output')) : undefined;

if (generatedFixturePath) {
  await generateFormatFixture(resolve(ROOT, generatedFixturePath));
} else if (capturePath) {
  await capture(resolve(ROOT, capturePath));
} else {
  await replay(fixturePath, outputPath, process.argv.includes('--check'));
}
