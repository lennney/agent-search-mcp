import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { classifyQuery } from '../dist/aggregation/query-classifier.js';

const querySetPath = new URL('./queries/intent-routing.json', import.meta.url);
const queries = JSON.parse(readFileSync(querySetPath, 'utf8'));
const baseline = { engines: ['duckduckgo', 'sogou'], ttl_ms: 60_000 };

function candidateRoute(classification) {
  if (classification.intent === 'news') {
    return {
      engines: classification.language === 'zh'
        ? ['sogou', 'baidu']
        : ['duckduckgo', 'bing'],
      ttl_ms: 15_000,
    };
  }
  if (classification.intent === 'docs') {
    return {
      engines: classification.language === 'zh'
        ? ['baidu', 'sogou']
        : ['wikipedia', 'duckduckgo'],
      ttl_ms: classification.freshness === 'current' ? 60_000 : 300_000,
    };
  }
  if (classification.intent === 'code') {
    return {
      engines: classification.language === 'zh'
        ? ['duckduckgo', 'baidu']
        : ['duckduckgo', 'bing'],
      ttl_ms: classification.freshness === 'current' ? 30_000 : 120_000,
    };
  }
  return baseline;
}

function sameRoute(left, right) {
  return left.ttl_ms === right.ttl_ms
    && left.engines.join(',') === right.engines.join(',');
}

const rssBefore = process.memoryUsage().rss;
const startedAt = performance.now();
const outcomes = queries.map(item => {
  const first = classifyQuery(item.query);
  const second = classifyQuery(item.query);
  const candidate = candidateRoute(first);
  return {
    id: item.id,
    correct: first.intent === item.intent
      && first.language === item.language
      && first.freshness === item.freshness,
    deterministic: JSON.stringify(first) === JSON.stringify(second),
    route_changed: !sameRoute(candidate, baseline),
  };
});
const elapsedMs = performance.now() - startedAt;
const correct = outcomes.filter(item => item.correct).length;
const deterministic = outcomes.filter(item => item.deterministic).length;
const routeChanges = outcomes.filter(item => item.route_changed).length;

const report = {
  schema_version: 'intent-routing-benchmark-v1',
  classifier_version: classifyQuery('').classifier_version,
  query_count: outcomes.length,
  slices: ['docs', 'news', 'code', 'general'],
  languages: ['en', 'zh'],
  classification_accuracy: correct / outcomes.length,
  deterministic_rate: deterministic / outcomes.length,
  candidate_route_change_rate: routeChanges / outcomes.length,
  elapsed_ms: Number(elapsedMs.toFixed(3)),
  avg_latency_ms: Number((elapsedMs / outcomes.length).toFixed(4)),
  rss_delta_bytes: process.memoryUsage().rss - rssBefore,
  runtime_integration: false,
  cancellation_surface_changed: false,
  zero_key_startup_changed: false,
  quality_evidence_available: false,
  production_eligible: false,
  failed_ids: outcomes.filter(item => !item.correct).map(item => item.id),
};

console.log(JSON.stringify(report, null, 2));

if (
  process.argv.includes('--check')
  && (
    report.query_count < 32
    || report.classification_accuracy < 0.9
    || report.deterministic_rate !== 1
    || report.candidate_route_change_rate <= 0
    || report.runtime_integration
    || report.cancellation_surface_changed
    || report.zero_key_startup_changed
    || report.production_eligible
  )
) {
  process.exitCode = 1;
}
