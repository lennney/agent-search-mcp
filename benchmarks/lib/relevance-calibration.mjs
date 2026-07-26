import { createHash } from 'node:crypto';

import {
  validateCompletedAdjudication,
  validateSearchPool,
} from './pooling.mjs';

const DEFAULTS = {
  currentThreshold: 0.35,
  minimumJudgments: 30,
  minimumQueries: 10,
  targetPrecision: 0.8,
};

function calibrationError(message) {
  throw new Error(`Invalid relevance calibration: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function round(value, digits = 4) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function boundedNumber(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    calibrationError(`${name} must be between 0 and 1`);
  }
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    calibrationError(`${name} must be a positive integer`);
  }
  return value;
}

function metricsAt(rows, threshold) {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  for (const row of rows) {
    const predictedRelevant = row.relevance >= threshold;
    if (predictedRelevant && row.relevant) truePositive += 1;
    else if (predictedRelevant) falsePositive += 1;
    else if (row.relevant) falseNegative += 1;
    else trueNegative += 1;
  }
  const predictedPositive = truePositive + falsePositive;
  const actualPositive = truePositive + falseNegative;
  const actualNegative = trueNegative + falsePositive;
  const precision = predictedPositive === 0 ? null : truePositive / predictedPositive;
  const recall = actualPositive === 0 ? null : truePositive / actualPositive;
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : 2 * precision * recall / (precision + recall);
  return {
    threshold: round(threshold, 2),
    true_positive: truePositive,
    false_positive: falsePositive,
    true_negative: trueNegative,
    false_negative: falseNegative,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    false_positive_rate: actualNegative === 0
      ? null
      : round(falsePositive / actualNegative),
  };
}

function compareMetrics(left, right, fields) {
  for (const field of fields) {
    const leftValue = left[field] ?? -1;
    const rightValue = right[field] ?? -1;
    if (leftValue !== rightValue) return rightValue - leftValue;
  }
  return right.threshold - left.threshold;
}

function selectBest(curve, fields) {
  return [...curve].sort((left, right) => compareMetrics(left, right, fields))[0] ?? null;
}

function validateCoverage(pool, adjudication) {
  const adjudicationSamples = new Map(
    adjudication.samples.map(sample => [sample.id, sample]),
  );
  if (adjudicationSamples.size !== pool.samples.length) {
    calibrationError('adjudication sample coverage differs from the source pool');
  }
  for (const poolSample of pool.samples) {
    const adjudicatedSample = adjudicationSamples.get(poolSample.id);
    if (!adjudicatedSample
      || adjudicatedSample.candidates.length !== poolSample.candidates.length) {
      calibrationError(`adjudication does not cover pool sample ${poolSample.id}`);
    }
    const adjudicatedCandidates = new Map(
      adjudicatedSample.candidates.map(candidate => [candidate.candidate_id, candidate]),
    );
    for (const candidate of poolSample.candidates) {
      const adjudicated = adjudicatedCandidates.get(candidate.candidate_id);
      if (!adjudicated || adjudicated.url !== candidate.url) {
        calibrationError(`adjudication candidate coverage differs for ${candidate.candidate_id}`);
      }
      adjudicatedCandidates.delete(candidate.candidate_id);
    }
    if (adjudicatedCandidates.size > 0) {
      calibrationError(`adjudication contains extra candidates for ${poolSample.id}`);
    }
    adjudicationSamples.delete(poolSample.id);
  }
  if (adjudicationSamples.size > 0) {
    calibrationError('adjudication contains extra samples');
  }
}

export function calibrateRelevanceGate(pool, adjudication, systemId, options = {}) {
  validateSearchPool(pool);
  validateCompletedAdjudication(adjudication);
  if (typeof systemId !== 'string'
    || !pool.source_captures.some(source => source.system_id === systemId)) {
    calibrationError('systemId must identify a source system in the pool');
  }
  const poolHash = sha256(pool);
  if (adjudication.source_pool_sha256 !== poolHash) {
    calibrationError('adjudication references a different source pool');
  }
  validateCoverage(pool, adjudication);

  const currentThreshold = round(boundedNumber(
    options.currentThreshold ?? DEFAULTS.currentThreshold,
    'currentThreshold',
  ), 2);
  const targetPrecision = boundedNumber(
    options.targetPrecision ?? DEFAULTS.targetPrecision,
    'targetPrecision',
  );
  const minimumQueries = positiveInteger(
    options.minimumQueries ?? DEFAULTS.minimumQueries,
    'minimumQueries',
  );
  const minimumJudgments = positiveInteger(
    options.minimumJudgments ?? DEFAULTS.minimumJudgments,
    'minimumJudgments',
  );

  const adjudicationBySample = new Map(
    adjudication.samples.map(sample => [
      sample.id,
      new Map(sample.candidates.map(candidate => [candidate.candidate_id, candidate])),
    ]),
  );
  const rows = [];
  for (const sample of pool.samples) {
    for (const candidate of sample.candidates) {
      const system = candidate.systems.find(source => source.system_id === systemId);
      if (!system) continue;
      if (system.routing_signals === undefined) {
        calibrationError(
          `${systemId}/${sample.id}/${candidate.candidate_id} has no protected routing signals`,
        );
      }
      const final = adjudicationBySample.get(sample.id).get(candidate.candidate_id).final;
      rows.push({
        sample_id: sample.id,
        candidate_id: candidate.candidate_id,
        relevance: system.routing_signals.relevance,
        relevant: final.relevance >= 2,
      });
    }
  }
  if (rows.length === 0) {
    calibrationError(`${systemId} returned no candidates in the pool`);
  }

  const thresholds = [...new Set([
    ...Array.from({ length: 21 }, (_, index) => round(index / 20, 2)),
    round(currentThreshold, 2),
  ])].sort((left, right) => left - right);
  const curve = thresholds.map(threshold => metricsAt(rows, threshold));
  const distinctQueries = new Set(rows.map(row => row.sample_id)).size;
  const positiveLabels = rows.filter(row => row.relevant).length;
  const negativeLabels = rows.length - positiveLabels;
  const unmet = [];
  if (distinctQueries < minimumQueries) unmet.push('minimum_queries');
  if (rows.length < minimumJudgments) unmet.push('minimum_judgments');
  if (positiveLabels === 0) unmet.push('positive_labels');
  if (negativeLabels === 0) unmet.push('negative_labels');

  const targetCandidates = curve.filter(metric =>
    metric.precision !== null && metric.precision >= targetPrecision);
  const targetBest = selectBest(
    targetCandidates,
    ['recall', 'precision', 'f1'],
  );
  const provisionalBest = selectBest(curve, ['f1', 'precision', 'recall']);
  const status = unmet.length > 0
    ? 'insufficient-sample'
    : targetBest === null
      ? 'target-unmet'
      : 'ready';
  const reviewMode = adjudication.review_mode
    ?? (adjudication.reviewers.every(reviewer => reviewer.kind === 'human')
      ? 'human'
      : 'ai');

  return {
    schema_version: 1,
    kind: 'relevance-gate-calibration',
    source_pool_sha256: poolHash,
    source_adjudication_sha256: sha256(adjudication),
    system_id: systemId,
    signal: 'routing_signals.relevance',
    label_definition: {
      review_mode: reviewMode,
      label_status: reviewMode === 'ai' ? 'ai-reviewed' : 'human-verified',
      relevant_when_final_relevance_at_least: 2,
    },
    dataset: {
      queries: distinctQueries,
      judgments: rows.length,
      positive_labels: positiveLabels,
      negative_labels: negativeLabels,
    },
    readiness: {
      status,
      minimum_queries: minimumQueries,
      minimum_judgments: minimumJudgments,
      unmet,
    },
    selection_policy: {
      target_precision: targetPrecision,
      order: [
        'meet target precision',
        'maximize recall',
        'maximize precision',
        'maximize F1',
        'prefer the highest threshold on ties',
      ],
    },
    current_threshold: metricsAt(rows, currentThreshold),
    provisional_best_threshold: provisionalBest,
    recommended_threshold: status === 'ready' ? targetBest.threshold : null,
    curve,
  };
}
