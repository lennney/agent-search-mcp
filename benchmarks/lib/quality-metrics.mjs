import { createHash } from 'node:crypto';

import { encode } from 'gpt-tokenizer';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const LABEL_STATUSES = new Set(['bootstrap', 'human-verified']);
const OUTCOME_STATUSES = new Set(['success', 'skipped', 'failed']);
const FRESHNESS_CLASSES = new Set(['evergreen', 'dynamic', 'false-premise', 'unknown']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentileNearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

function ndcgAt(labels, limit) {
  const relevance = labels.slice(0, limit).map(label => label.relevance);
  const ideal = [...labels]
    .map(label => label.relevance)
    .sort((a, b) => b - a)
    .slice(0, limit);
  const dcg = relevance.reduce(
    (sum, grade, index) => sum + grade / Math.log2(index + 2),
    0,
  );
  const idealDcg = ideal.reduce(
    (sum, grade, index) => sum + grade / Math.log2(index + 2),
    0,
  );
  return idealDcg === 0 ? 0 : dcg / idealDcg;
}

function buildSliceSummary(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key] ?? 'unknown';
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, group]) => {
        const average = field =>
          group.reduce((sum, row) => sum + row[field], 0) / group.length;
        const relevant = group.reduce((sum, row) => sum + row.relevantResults, 0);
        const supported = group.reduce((sum, row) => sum + row.supportedRelevantResults, 0);
        const expected = group.reduce((sum, row) => sum + row.expectedFailures, 0);
        const disclosed = group.reduce((sum, row) => sum + row.disclosedFailures, 0);
        return [value, {
          queries: group.length,
          answer_accuracy_percent: round(average('answerCorrect') * 100),
          ndcg_at_5_percent: round(average('ndcg') * 100),
          success_at_5_percent: round(average('success') * 100),
          citation_support_percent: relevant === 0 ? null : round(supported / relevant * 100),
          failure_disclosure_percent: expected === 0 ? 100 : round(disclosed / expected * 100),
        }];
      }),
  );
}

function fixtureError(message) {
  throw new Error(`Invalid quality fixture: ${message}`);
}

export function buildCaptureTrace(response, options) {
  const searchedEngines = new Set(response.meta?.execution?.searched_engines ?? []);
  const failedEngines = new Set(
    (response.partialFailures ?? []).map(failure => failure.engine),
  );
  return {
    started_at: options.startedAt,
    duration_ms: options.durationMs,
    raw_response_sha256: createHash('sha256')
      .update(JSON.stringify(response))
      .digest('hex'),
    engine_outcomes: options.requestedEngines.map(engine => ({
      engine,
      status: failedEngines.has(engine)
        ? 'failed'
        : searchedEngines.has(engine)
          ? 'success'
          : 'skipped',
    })),
  };
}

export function prepareHumanLabelTemplate(capture) {
  if (!isRecord(capture) || !Array.isArray(capture.samples)) {
    fixtureError('capture.samples must be an array');
  }
  const samples = capture.samples
    .filter(sample => isRecord(sample.response) && Array.isArray(sample.response.results))
    .map(sample => {
      if (!isRecord(sample.trace)) {
        fixtureError(`capture sample ${sample.id ?? 'unknown'} has no raw trace`);
      }
      return {
        id: sample.id,
        query: sample.query,
        language: sample.language,
        category: sample.category ?? 'unknown',
        freshness: sample.freshness ?? 'unknown',
        ...(typeof sample.question === 'string' && { question: sample.question }),
        ...(typeof sample.reference_answer === 'string'
          && { reference_answer: sample.reference_answer }),
        response: sample.response,
        trace: sample.trace,
        labels: {
          answer_correct: null,
          results: sample.response.results.map(result => ({
            url: result.url,
            relevance: null,
            citation_supported: null,
          })),
        },
      };
    });
  if (samples.length === 0) fixtureError('capture has no successful traced samples');

  return {
    schema_version: 1,
    kind: 'labeled-search-quality',
    source_capture_sha256: createHash('sha256')
      .update(JSON.stringify(capture))
      .digest('hex'),
    ...(isRecord(capture.content_licenses)
      && { content_licenses: capture.content_licenses }),
    labeling: {
      status: 'pending-human',
      relevance_scale: { min: 0, max: 3, relevant_threshold: 2 },
      instructions: [
        'Set answer_correct to true or false.',
        'Set each relevance label to 0, 1, 2, or 3.',
        'Set citation_supported to true only when the result supports the expected answer.',
        'Retain independent per-result judgments from two human reviewers.',
        'Complete adjudication, set verified_at, then change status to human-verified.',
      ],
    },
    samples,
  };
}

export function prepareBlindedReviewPacket(fixture, options = {}) {
  if (!isRecord(fixture) || !Array.isArray(fixture.samples)) {
    fixtureError('review fixture samples must be an array');
  }
  const reviewerSlot = options.reviewerSlot;
  if (typeof reviewerSlot !== 'string' || reviewerSlot.trim().length === 0) {
    fixtureError('reviewerSlot is required');
  }
  const sourceFixtureSha256 = createHash('sha256')
    .update(JSON.stringify(fixture))
    .digest('hex');

  return {
    schema_version: 1,
    kind: 'blinded-search-review',
    source_fixture_sha256: sourceFixtureSha256,
    ...(isRecord(fixture.content_licenses)
      && { content_licenses: fixture.content_licenses }),
    reviewer_slot: reviewerSlot,
    instructions: [
      'Judge candidates independently without consulting another reviewer.',
      'Use relevance 0 for irrelevant, 1 for marginal, 2 for relevant, and 3 for highly relevant.',
      'Set citation_supported only when the candidate supports the reference answer.',
      'Do not add engine or ranking-system identity to this packet.',
    ],
    samples: fixture.samples.map((sample, sampleIndex) => {
      if (!isRecord(sample)
        || typeof sample.id !== 'string'
        || !isRecord(sample.response)
        || !Array.isArray(sample.response.results)) {
        fixtureError(`review sample ${sampleIndex} is invalid`);
      }
      const candidates = sample.response.results
        .map(result => {
          const candidateId = `c-${createHash('sha256')
            .update(`${sample.id}\0${result.url}`)
            .digest('hex')
            .slice(0, 12)}`;
          return {
            candidate_id: candidateId,
            title: result.title,
            url: result.url,
            snippet: result.snippet ?? '',
            relevance: null,
            citation_supported: null,
          };
        });
      const originalOrder = candidates.map(candidate => candidate.candidate_id);
      candidates.sort((left, right) => {
        const sortKey = candidate => createHash('sha256')
          .update(`${sourceFixtureSha256}\0${reviewerSlot}\0${sample.id}\0${candidate.candidate_id}`)
          .digest('hex');
        return sortKey(left).localeCompare(sortKey(right));
      });
      if (candidates.length > 1
        && candidates.every((candidate, index) =>
          candidate.candidate_id === originalOrder[index])) {
        candidates.push(candidates.shift());
      }

      return {
        id: sample.id,
        query: sample.query,
        ...(typeof sample.question === 'string' && { question: sample.question }),
        ...(typeof sample.reference_answer === 'string'
          && { reference_answer: sample.reference_answer }),
        candidates,
      };
    }),
  };
}

export function validateQualityFixture(fixture, options = {}) {
  if (!isRecord(fixture)) fixtureError('root must be an object');
  if (fixture.schema_version !== 1) fixtureError('schema_version must be 1');
  if (fixture.kind !== 'labeled-search-quality') {
    fixtureError('kind must be labeled-search-quality');
  }
  if (!isRecord(fixture.labeling) || !LABEL_STATUSES.has(fixture.labeling.status)) {
    fixtureError('labeling.status must be bootstrap or human-verified');
  }
  if (options.requireHuman && fixture.labeling.status !== 'human-verified') {
    fixtureError('labeling.status must be human-verified for quality claims');
  }
  let requiredHumanReviewerIds = null;
  if (fixture.labeling.status === 'human-verified') {
    const humanReviewers = Array.isArray(fixture.labeling.reviewers)
      ? fixture.labeling.reviewers.filter(reviewer =>
        isRecord(reviewer) && reviewer.kind === 'human' && typeof reviewer.id === 'string')
      : [];
    const reviewerIds = new Set(humanReviewers.map(reviewer => reviewer.id));
    if (reviewerIds.size < 2 || !Number.isFinite(Date.parse(fixture.labeling.verified_at))) {
      fixtureError('human-verified labels require two human reviewers and verified_at');
    }
    const adjudication = fixture.labeling.adjudication;
    if (!isRecord(adjudication)
      || adjudication.status !== 'completed'
      || !reviewerIds.has(adjudication.adjudicator_id)) {
      fixtureError('human-verified labels require completed adjudication');
    }
    requiredHumanReviewerIds = reviewerIds;
  }

  const scale = fixture.labeling.relevance_scale;
  if (!isRecord(scale)
    || !Number.isInteger(scale.min)
    || !Number.isInteger(scale.max)
    || !Number.isInteger(scale.relevant_threshold)
    || scale.min !== 0
    || scale.max < scale.relevant_threshold) {
    fixtureError('labeling.relevance_scale is invalid');
  }
  if (!Array.isArray(fixture.samples) || fixture.samples.length === 0) {
    fixtureError('samples must be a non-empty array');
  }

  const ids = new Set();
  for (const [sampleIndex, sample] of fixture.samples.entries()) {
    const prefix = `samples[${sampleIndex}]`;
    if (!isRecord(sample) || typeof sample.id !== 'string' || !sample.id) {
      fixtureError(`${prefix}.id is required`);
    }
    if (ids.has(sample.id)) fixtureError(`${prefix}.id must be unique`);
    ids.add(sample.id);
    if (typeof sample.query !== 'string' || !sample.query) fixtureError(`${prefix}.query is required`);
    if (typeof sample.language !== 'string' || sample.language.length < 2) {
      fixtureError(`${prefix}.language is required`);
    }
    if (typeof sample.category !== 'string' || !sample.category) {
      fixtureError(`${prefix}.category is required`);
    }
    if (!FRESHNESS_CLASSES.has(sample.freshness)) {
      fixtureError(`${prefix}.freshness is invalid`);
    }
    if (!isRecord(sample.response) || !Array.isArray(sample.response.results)) {
      fixtureError(`${prefix}.response.results must be an array`);
    }
    if (!isRecord(sample.trace)
      || !Number.isFinite(sample.trace.duration_ms)
      || sample.trace.duration_ms < 0
      || !SHA256_PATTERN.test(sample.trace.raw_response_sha256)
      || !Array.isArray(sample.trace.engine_outcomes)) {
      fixtureError(`${prefix}.trace must contain duration, response hash, and engine outcomes`);
    }
    const expectedResponseHash = createHash('sha256')
      .update(JSON.stringify(sample.response))
      .digest('hex');
    if (sample.trace.raw_response_sha256 !== expectedResponseHash) {
      fixtureError(`${prefix}.trace.raw_response_sha256 does not match response`);
    }
    for (const outcome of sample.trace.engine_outcomes) {
      if (!isRecord(outcome)
        || typeof outcome.engine !== 'string'
        || !OUTCOME_STATUSES.has(outcome.status)) {
        fixtureError(`${prefix}.trace.engine_outcomes contains an invalid outcome`);
      }
    }
    const outcomeEngines = sample.trace.engine_outcomes.map(outcome => outcome.engine);
    if (new Set(outcomeEngines).size !== outcomeEngines.length) {
      fixtureError(`${prefix}.trace engine outcomes must be unique by engine`);
    }
    if (!isRecord(sample.labels)
      || typeof sample.labels.answer_correct !== 'boolean'
      || !Array.isArray(sample.labels.results)) {
      fixtureError(`${prefix}.labels must include answer_correct and result labels`);
    }

    const resultUrls = sample.response.results.map(result => result?.url);
    if (resultUrls.some(url => typeof url !== 'string' || !url)
      || new Set(resultUrls).size !== resultUrls.length) {
      fixtureError(`${prefix}.response result URLs must be unique non-empty strings`);
    }
    const labelUrls = new Set();
    for (const [labelIndex, label] of sample.labels.results.entries()) {
      const labelPrefix = `${prefix}.labels.results[${labelIndex}]`;
      if (!isRecord(label) || typeof label.url !== 'string' || !resultUrls.includes(label.url)) {
        fixtureError(`${labelPrefix}.url ${label?.url ?? 'missing'} is not a returned result`);
      }
      if (labelUrls.has(label.url)) fixtureError(`${labelPrefix}.url must be unique`);
      labelUrls.add(label.url);
      if (!Number.isInteger(label.relevance)
        || label.relevance < scale.min
        || label.relevance > scale.max) {
        fixtureError(`${labelPrefix}.relevance is outside the configured scale`);
      }
      if (typeof label.citation_supported !== 'boolean') {
        fixtureError(`${labelPrefix}.citation_supported must be boolean`);
      }
    }
    if (labelUrls.size !== resultUrls.length) {
      fixtureError(`${prefix}.labels must cover every returned result URL`);
    }

    if (requiredHumanReviewerIds) {
      if (!Array.isArray(sample.reviews)) {
        fixtureError(`${prefix} must retain independent reviews`);
      }
      const reviewIds = new Set(sample.reviews.map(review => review?.reviewer_id));
      if (sample.reviews.length !== requiredHumanReviewerIds.size
        || reviewIds.size !== requiredHumanReviewerIds.size
        || [...requiredHumanReviewerIds].some(reviewerId => !reviewIds.has(reviewerId))) {
        fixtureError(`${prefix} must retain independent reviews from every reviewer`);
      }
      for (const [reviewIndex, review] of sample.reviews.entries()) {
        const reviewPrefix = `${prefix}.reviews[${reviewIndex}]`;
        if (!isRecord(review)
          || !requiredHumanReviewerIds.has(review.reviewer_id)
          || typeof review.answer_correct !== 'boolean'
          || !Array.isArray(review.results)) {
          fixtureError(`${reviewPrefix} is invalid`);
        }
        const reviewUrls = new Set();
        for (const judgment of review.results) {
          if (!isRecord(judgment)
            || typeof judgment.url !== 'string'
            || !resultUrls.includes(judgment.url)
            || !Number.isInteger(judgment.relevance)
            || judgment.relevance < scale.min
            || judgment.relevance > scale.max
            || typeof judgment.citation_supported !== 'boolean') {
            fixtureError(`${reviewPrefix} contains an invalid result judgment`);
          }
          reviewUrls.add(judgment.url);
        }
        if (reviewUrls.size !== resultUrls.length) {
          fixtureError(`${reviewPrefix} must cover every returned result URL`);
        }
      }
    }
  }
  if ((options.requireHuman || fixture.labeling.status === 'human-verified')
    && fixture.samples.every(sample => sample.response.results.length === 0)) {
    fixtureError('quality claims require a non-empty pooled capture');
  }
  return fixture;
}

export function evaluateQualityFixture(fixture, options = {}) {
  const validated = validateQualityFixture(fixture, {
    requireHuman: options.requireHuman ?? false,
  });
  const tokenCounter = options.tokenCounter
    ?? (value => encode(JSON.stringify(value)).length);
  const threshold = validated.labeling.relevance_scale.relevant_threshold;

  let labeledResults = 0;
  let correctAnswers = 0;
  let totalTokens = 0;
  let relevantResults = 0;
  let supportedRelevantResults = 0;
  let expectedFailures = 0;
  let disclosedFailures = 0;
  let traceCount = 0;
  const ndcgScores = [];
  const precisionScores = [];
  const reciprocalRankScores = [];
  const successScores = [];
  const latencies = [];
  const sliceRows = [];

  for (const sample of validated.samples) {
    const labelsByUrl = new Map(sample.labels.results.map(label => [label.url, label]));
    const orderedLabels = sample.response.results.map(result => labelsByUrl.get(result.url));
    const topLabels = orderedLabels.slice(0, 5);
    const relevantTop = topLabels.filter(label => label.relevance >= threshold).length;
    const firstRelevantIndex = topLabels.findIndex(label => label.relevance >= threshold);

    labeledResults += orderedLabels.length;
    correctAnswers += sample.labels.answer_correct ? 1 : 0;
    totalTokens += tokenCounter(sample.response);
    ndcgScores.push(ndcgAt(orderedLabels, 5));
    precisionScores.push(topLabels.length === 0 ? 0 : relevantTop / topLabels.length);
    reciprocalRankScores.push(firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1));
    successScores.push(firstRelevantIndex < 0 ? 0 : 1);
    latencies.push(sample.trace.duration_ms);
    traceCount += 1;

    for (const label of orderedLabels) {
      if (label.relevance >= threshold) {
        relevantResults += 1;
        if (label.citation_supported) supportedRelevantResults += 1;
      }
    }

    const failedEngines = sample.trace.engine_outcomes
      .filter(outcome => outcome.status === 'failed')
      .map(outcome => outcome.engine);
    const disclosedEngines = new Set(
      (sample.response.partialFailures ?? []).map(failure => failure.engine),
    );
    const sampleDisclosedFailures = failedEngines
      .filter(engine => disclosedEngines.has(engine))
      .length;
    expectedFailures += failedEngines.length;
    disclosedFailures += sampleDisclosedFailures;
    sliceRows.push({
      language: sample.language,
      category: sample.category,
      freshness: sample.freshness,
      answerCorrect: sample.labels.answer_correct ? 1 : 0,
      ndcg: ndcgScores.at(-1),
      success: successScores.at(-1),
      relevantResults: orderedLabels.filter(label => label.relevance >= threshold).length,
      supportedRelevantResults: orderedLabels.filter(
        label => label.relevance >= threshold && label.citation_supported,
      ).length,
      expectedFailures: failedEngines.length,
      disclosedFailures: sampleDisclosedFailures,
    });
  }

  const queryCount = validated.samples.length;
  const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const disclosureRate = expectedFailures === 0 ? 100 : disclosedFailures / expectedFailures * 100;

  return {
    schema_version: 1,
    summary: {
      evaluated_queries: queryCount,
      labeled_results: labeledResults,
      label_status: validated.labeling.status,
      quality_claim_eligible: validated.labeling.status === 'human-verified',
      quality: {
        answer_accuracy_percent: round(correctAnswers / queryCount * 100),
        ndcg_at_5_percent: round(average(ndcgScores) * 100),
        precision_at_5_percent: round(average(precisionScores) * 100),
        reciprocal_rank_at_5_percent: round(average(reciprocalRankScores) * 100),
        success_at_5_percent: round(average(successScores) * 100),
      },
      citation_support: {
        supported_relevant_results: supportedRelevantResults,
        relevant_results: relevantResults,
        rate_percent: relevantResults === 0
          ? null
          : round(supportedRelevantResults / relevantResults * 100),
      },
      token_efficiency: {
        total_response_tokens: totalTokens,
        correct_answers: correctAnswers,
        tokens_per_correct_answer: correctAnswers === 0
          ? null
          : round(totalTokens / correctAnswers),
      },
      latency: {
        average_ms: round(average(latencies)),
        p50_ms: percentileNearestRank(latencies, 0.5),
        p95_ms: percentileNearestRank(latencies, 0.95),
      },
      failure_transparency: {
        expected_failures: expectedFailures,
        disclosed_failures: disclosedFailures,
        undisclosed_failures: expectedFailures - disclosedFailures,
        disclosure_rate_percent: round(disclosureRate),
      },
      raw_trace_coverage_percent: round(traceCount / queryCount * 100),
    },
    slices: {
      language: buildSliceSummary(sliceRows, 'language'),
      category: buildSliceSummary(sliceRows, 'category'),
      freshness: buildSliceSummary(sliceRows, 'freshness'),
    },
  };
}
