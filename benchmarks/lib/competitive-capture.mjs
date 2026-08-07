import {
  COMPETITIVE_DELAY_MS,
  COMPETITIVE_RESULT_LIMIT,
  isTerminalCaptureFailure,
} from './capture-contract.mjs';

export const COMPETITIVE_SYSTEMS = Object.freeze([
  Object.freeze({
    id: 'agent-search-free-waterfall',
    version: 'repository-build',
    adapter: 'benchmark-driver',
    options: Object.freeze({
      provider_mode: 'free_only',
      routing: 'waterfall',
      engines: 'runtime-free-registry',
      enrichment: false,
      query_expansion: false,
    }),
  }),
  Object.freeze({
    id: 'open-websearch-2.1.9',
    version: '2.1.9',
    adapter: 'benchmark-driver',
    options: Object.freeze({
      engines: Object.freeze([
        'bing',
        'baidu',
        'csdn',
        'duckduckgo',
        'exa',
        'brave',
        'juejin',
        'startpage',
        'sogou',
      ]),
      source_commit: '3f36330dfba873d66c52116d8c8334aaf65137f4',
      request_only: true,
      playwright: false,
      proxy: false,
    }),
  }),
  Object.freeze({
    id: 'ddgs-9.14.4',
    version: '9.14.4',
    adapter: 'benchmark-driver',
    options: Object.freeze({
      package: 'base',
      method: 'text',
      backend: 'auto',
      region_by_language: Object.freeze({ en: 'us-en', zh: 'cn-zh' }),
      dht: false,
      proxy: false,
    }),
  }),
]);

function fail(message) {
  throw new Error(`Invalid competitive capture plan: ${message}`);
}

export function buildCompetitiveCapturePlan(querySet, options = {}) {
  const queries = Array.isArray(querySet) ? querySet : querySet?.queries;
  if (!Array.isArray(queries) || queries.length === 0) fail('query set is empty');
  const systems = options.systems ?? COMPETITIVE_SYSTEMS;
  if (!Array.isArray(systems) || systems.length !== 3) fail('exactly three systems are required');
  const resultLimit = options.resultLimit ?? COMPETITIVE_RESULT_LIMIT;
  const delayMs = options.delayMs ?? COMPETITIVE_DELAY_MS;
  if (resultLimit !== COMPETITIVE_RESULT_LIMIT) fail('formal comparison result limit must be 5');
  if (!Number.isInteger(delayMs) || delayMs < COMPETITIVE_DELAY_MS) {
    fail('delay must be at least 10000ms');
  }

  const calls = [];
  for (const [queryIndex, query] of queries.entries()) {
    for (let position = 0; position < systems.length; position += 1) {
      const system = systems[(queryIndex + position) % systems.length];
      calls.push({
        sequence: calls.length + 1,
        query_index: queryIndex,
        order_in_query: position + 1,
        sample_id: query.id,
        query: query.query,
        language: query.language,
        system_id: system.id,
        system_version: system.version,
        result_limit: resultLimit,
        delay_before_ms: calls.length === 0 ? 0 : delayMs,
        retry_limit: 0,
        options: system.options,
      });
    }
  }
  return {
    schema_version: 1,
    kind: 'competitive-capture-plan',
    result_limit: resultLimit,
    delay_ms: delayMs,
    retry_limit: 0,
    expected_sample_count: queries.length * systems.length,
    systems: systems.map(system => ({
      id: system.id,
      version: system.version,
      adapter: system.adapter,
      options: system.options,
    })),
    calls,
  };
}

export async function runCompetitiveCapturePlan(plan, adapters = {}) {
  if (typeof adapters.invoke !== 'function') fail('invoke adapter is required');
  const sleep = adapters.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  if (typeof sleep !== 'function') fail('sleep adapter must be a function');
  if (adapters.onCheckpoint !== undefined && typeof adapters.onCheckpoint !== 'function') {
    fail('onCheckpoint must be a function');
  }
  const completed = [];
  const state = {
    schema_version: 1,
    kind: 'competitive-capture-checkpoint',
    capture_status: 'incomplete',
    expected_sample_count: plan.expected_sample_count,
    completed_sample_count: 0,
    result_limit: plan.result_limit,
    retry_limit: 0,
    samples: completed,
  };

  for (const call of plan.calls) {
    if (call.delay_before_ms > 0) await sleep(call.delay_before_ms);
    let outcome;
    try {
      outcome = await adapters.invoke(structuredClone(call));
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      outcome = {
        failure_type: /(?:unpinned|no driver configured|configuration)/iu.test(errorText)
          ? 'configuration_mismatch'
          : /bot[_ -]?challenge/iu.test(errorText)
          ? 'bot_challenge'
          : isTerminalCaptureFailure(error) ? 'rate_limited' : 'upstream_error',
      };
    }
    completed.push({ ...call, outcome });
    state.completed_sample_count = completed.length;
    if (isTerminalCaptureFailure(outcome)
      || outcome.failure_type === 'configuration_mismatch') {
      state.capture_status = 'aborted';
      state.stop_reason = outcome.failure_type ?? outcome.type ?? 'terminal_failure';
      if (adapters.onCheckpoint) await adapters.onCheckpoint(structuredClone(state));
      return state;
    }
    if (adapters.onCheckpoint) await adapters.onCheckpoint(structuredClone(state));
  }
  state.capture_status = 'complete';
  if (adapters.onCheckpoint) await adapters.onCheckpoint(structuredClone(state));
  return state;
}
