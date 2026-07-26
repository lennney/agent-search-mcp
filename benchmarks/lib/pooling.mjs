import { createHash } from 'node:crypto';

import {
  AI_REVIEW_PROMPT_SHA256,
  AI_REVIEW_PROMPT_VERSION,
} from './ai-review.mjs';

const SYSTEM_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const SAMPLE_METADATA = [
  'query',
  'language',
  'category',
  'freshness',
  'question',
  'reference_answer',
];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function poolError(message) {
  throw new Error(`Invalid search pool: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function canonicalizePoolUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    poolError(`result URL is invalid: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    poolError(`result URL must use HTTP(S): ${value}`);
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|fbclid|gclid|msclkid)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const query = url.searchParams.toString();
  const search = query ? `?${query}` : '';
  return `${url.protocol}//${url.host.toLowerCase()}${pathname}${search}`;
}

export function poolLiveCaptures(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 2) {
    poolError('at least two systems are required');
  }
  const sortedInputs = [...inputs].sort((left, right) =>
    String(left?.systemId).localeCompare(String(right?.systemId)));
  const systemIds = sortedInputs.map(input => input?.systemId);
  if (systemIds.some(systemId => typeof systemId !== 'string' || !SYSTEM_ID.test(systemId))) {
    poolError('system IDs must be stable lowercase identifiers');
  }
  if (new Set(systemIds).size !== systemIds.length) {
    poolError('system IDs must be unique');
  }
  sortedInputs.forEach(({ systemId, capture }) => validateCapture(capture, systemId));

  const firstCapture = sortedInputs[0].capture;
  const firstSampleIds = firstCapture.samples.map(sample => sample.id);
  for (const { systemId, capture } of sortedInputs.slice(1)) {
    const sampleIds = capture.samples.map(sample => sample.id);
    if (JSON.stringify(sampleIds) !== JSON.stringify(firstSampleIds)) {
      poolError(`${systemId} sample IDs/order do not match the pool`);
    }
  }

  const contentLicenses = {};
  const sourceCaptures = sortedInputs.map(({ systemId, capture }) => {
    for (const [publisher, license] of Object.entries(capture.content_licenses ?? {})) {
      if (publisher in contentLicenses
        && JSON.stringify(contentLicenses[publisher]) !== JSON.stringify(license)) {
        poolError(`content license conflict for ${publisher}`);
      }
      contentLicenses[publisher] = license;
    }
    return {
      system_id: systemId,
      capture_sha256: sha256(capture),
      captured_at: capture.captured_at,
      package_version: capture.package_version,
      requested_engines: capture.requested_engines,
    };
  });

  const samples = firstSampleIds.map((sampleId, sampleIndex) => {
    const sourceSamples = sortedInputs.map(({ systemId, capture }) => ({
      systemId,
      sample: capture.samples[sampleIndex],
    }));
    const baseline = sourceSamples[0].sample;
    for (const { systemId, sample } of sourceSamples.slice(1)) {
      const baselineMetadata = Object.fromEntries(
        SAMPLE_METADATA.map(key => [key, baseline[key] ?? null]),
      );
      const sampleMetadata = Object.fromEntries(
        SAMPLE_METADATA.map(key => [key, sample[key] ?? null]),
      );
      if (JSON.stringify(sampleMetadata) !== JSON.stringify(baselineMetadata)) {
        poolError(`${systemId} query metadata differs for ${sampleId}`);
      }
    }

    const candidatesByUrl = new Map();
    const systemRuns = [];
    for (const { systemId, sample } of sourceSamples) {
      const resultOrder = [];
      const seenInSystem = new Set();
      if (isRecord(sample.response) && Array.isArray(sample.response.results)) {
        for (const [resultIndex, result] of sample.response.results.entries()) {
          validateResult(result, systemId, sampleId, resultIndex);
          const canonicalUrl = canonicalizePoolUrl(result.url);
          if (seenInSystem.has(canonicalUrl)) {
            poolError(`${systemId}/${sampleId} contains a duplicate canonical URL`);
          }
          seenInSystem.add(canonicalUrl);
          const candidateId = `c-${createHash('sha256')
            .update(canonicalUrl)
            .digest('hex')
            .slice(0, 16)}`;
          resultOrder.push(candidateId);
          const candidate = candidatesByUrl.get(canonicalUrl) ?? {
            candidate_id: candidateId,
            canonical_url: canonicalUrl,
            variants: [],
            systems: [],
          };
          candidate.variants.push({
            title: result.title,
            url: result.url,
            snippet: result.snippet ?? '',
            raw_result_sha256: sha256(result),
          });
          const routingSignals = getRoutingSignals(result);
          candidate.systems.push({
            system_id: systemId,
            rank: resultIndex + 1,
            raw_result_sha256: sha256(result),
            ...(routingSignals !== null && { routing_signals: routingSignals }),
          });
          candidatesByUrl.set(canonicalUrl, candidate);
        }
      }
      systemRuns.push({
        system_id: systemId,
        status: isRecord(sample.response) ? 'success' : 'failed',
        duration_ms: sample.duration_ms,
        raw_response_sha256: sample.trace?.raw_response_sha256 ?? null,
        engine_outcomes: Array.isArray(sample.trace?.engine_outcomes)
          ? sample.trace.engine_outcomes
          : [],
        partial_failures: isRecord(sample.response)
          && Array.isArray(sample.response.partialFailures)
          ? sample.response.partialFailures
          : [],
        result_order: resultOrder,
        ...(typeof sample.error === 'string' && { error: sample.error }),
      });
    }

    const candidates = [...candidatesByUrl.values()]
      .map(candidate => {
        const variants = [...candidate.variants].sort((left, right) =>
          right.snippet.length - left.snippet.length
          || right.title.length - left.title.length
          || left.raw_result_sha256.localeCompare(right.raw_result_sha256));
        const selected = variants[0];
        return {
          candidate_id: candidate.candidate_id,
          canonical_url: candidate.canonical_url,
          title: selected.title,
          url: selected.url,
          snippet: selected.snippet,
          systems: [...candidate.systems].sort((left, right) =>
            left.system_id.localeCompare(right.system_id)),
        };
      })
      .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

    return {
      id: sampleId,
      ...Object.fromEntries(
        SAMPLE_METADATA
          .filter(key => baseline[key] !== undefined)
          .map(key => [key, baseline[key]]),
      ),
      candidates,
      system_runs: systemRuns,
    };
  });
  if (!samples.some(sample => sample.candidates.length > 0)) {
    poolError('captures produced no non-empty candidate pool');
  }

  return {
    schema_version: 1,
    kind: 'pooled-search-capture',
    source_captures: sourceCaptures,
    content_licenses: contentLicenses,
    samples,
  };
}

export function prepareReviewAdjudication(pool, packets) {
  validateSearchPool(pool);
  if (!Array.isArray(packets) || packets.length < 2) {
    poolError('at least two completed reviewer packets are required');
  }
  const poolHash = sha256(pool);
  const sortedPackets = [...packets].sort((left, right) =>
    String(left?.reviewer_slot).localeCompare(String(right?.reviewer_slot)));
  const reviewerSlots = sortedPackets.map(packet => packet?.reviewer_slot);
  if (reviewerSlots.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(reviewerSlots).size !== reviewerSlots.length) {
    poolError('reviewer slots must be unique');
  }
  sortedPackets.forEach(packet => validateCompletedPacket(packet, pool, poolHash));
  const reviewModes = new Set(sortedPackets.map(packet => packet.reviewer.kind));
  if (reviewModes.size !== 1) {
    poolError('completed reviews must use the same review mode');
  }
  const reviewMode = sortedPackets[0].reviewer.kind;
  const reviewers = sortedPackets.map(packet => reviewMode === 'human'
    ? {
        id: packet.reviewer.id,
        kind: 'human',
        reviewer_slot: packet.reviewer_slot,
      }
    : {
        ...packet.reviewer,
        reviewer_slot: packet.reviewer_slot,
      });
  if (new Set(reviewers.map(reviewer => reviewer.id)).size !== reviewers.length) {
    poolError('completed reviews require distinct reviewer IDs');
  }
  if (reviewMode === 'ai'
    && new Set(reviewers.map(reviewer => reviewer.model_family)).size !== reviewers.length) {
    poolError('completed AI reviews require distinct model families');
  }

  let agreements = 0;
  let disagreements = 0;
  const samples = pool.samples.map(poolSample => {
    const packetSamples = sortedPackets.map(packet =>
      packet.samples.find(sample => sample.id === poolSample.id));
    return {
      id: poolSample.id,
      query: poolSample.query,
      ...(typeof poolSample.question === 'string' && { question: poolSample.question }),
      ...(typeof poolSample.reference_answer === 'string'
        && { reference_answer: poolSample.reference_answer }),
      candidates: poolSample.candidates.map(candidate => {
        const judgments = packetSamples.map((sample, index) => {
          const reviewed = sample.candidates
            .find(item => item.candidate_id === candidate.candidate_id);
          const judgment = {
            reviewer_id: reviewers[index].id,
            relevance: reviewed.relevance,
            citation_supported: reviewed.citation_supported,
          };
          if (reviewMode === 'ai') {
            judgment.rationale = reviewed.rationale;
            judgment.judge_evidence = reviewed.judge_evidence;
          }
          return judgment;
        });
        const agreement = judgments.every(judgment =>
          judgment.relevance === judgments[0].relevance
          && judgment.citation_supported === judgments[0].citation_supported);
        if (agreement) agreements += 1;
        else disagreements += 1;
        return {
          candidate_id: candidate.candidate_id,
          url: candidate.url,
          judgments,
          agreement,
          final: agreement
            ? {
                relevance: judgments[0].relevance,
                citation_supported: judgments[0].citation_supported,
              }
            : { relevance: null, citation_supported: null },
        };
      }),
    };
  });

  return {
    schema_version: 1,
    kind: 'search-review-adjudication',
    source_pool_sha256: poolHash,
    reviewers,
    review_mode: reviewMode,
    status: 'pending-adjudication',
    summary: {
      candidates: agreements + disagreements,
      agreements,
      disagreements,
    },
    reviewer_agreement: calculateReviewerAgreement(samples, reviewers.map(reviewer => reviewer.id)),
    samples,
  };
}

export function validateCompletedAdjudication(adjudication) {
  if (!isRecord(adjudication)
    || adjudication.kind !== 'search-review-adjudication'
    || adjudication.status !== 'completed') {
    poolError('adjudication status must be completed');
  }
  if (!Array.isArray(adjudication.reviewers)
    || adjudication.reviewers.length < 2
    || !Array.isArray(adjudication.samples)) {
    poolError('completed adjudication must retain two reviewers and samples');
  }
  const reviewMode = adjudication.review_mode
    ?? (adjudication.reviewers.every(reviewer => reviewer?.kind === 'human')
      ? 'human'
      : null);
  if (!['human', 'ai'].includes(reviewMode)
    || !isRecord(adjudication.adjudicator)
    || adjudication.adjudicator.kind !== reviewMode
    || typeof adjudication.adjudicator.id !== 'string'
    || adjudication.adjudicator.id.length === 0
    || !Number.isFinite(Date.parse(adjudication.adjudicator.completed_at))) {
    poolError('completed adjudication requires a matching reviewer mode and timestamp');
  }
  const sampleIds = adjudication.samples.map(sample => sample?.id);
  if (sampleIds.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(sampleIds).size !== sampleIds.length) {
    poolError('completed adjudication sample IDs must be unique');
  }
  const reviewerIds = adjudication.reviewers.map(reviewer => reviewer?.id);
  if (reviewerIds.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(reviewerIds).size !== reviewerIds.length
    || adjudication.reviewers.some(reviewer => reviewer?.kind !== reviewMode)) {
    poolError('completed adjudication must retain distinct same-mode reviewers');
  }
  if (reviewMode === 'ai') {
    adjudication.reviewers.forEach((reviewer, index) =>
      validateAiActor(reviewer, `reviewer ${index + 1}`));
    validateAiActor(adjudication.adjudicator, 'adjudicator');
    const reviewerFamilies = adjudication.reviewers.map(reviewer => reviewer.model_family);
    if (new Set(reviewerFamilies).size !== reviewerFamilies.length
      || reviewerFamilies.includes(adjudication.adjudicator.model_family)) {
      poolError('completed AI adjudication requires independent model families');
    }
  }
  for (const sample of adjudication.samples) {
    if (!Array.isArray(sample?.candidates)) poolError('adjudication sample is invalid');
    const candidateIds = new Set();
    for (const candidate of sample.candidates) {
      if (typeof candidate?.candidate_id !== 'string'
        || candidateIds.has(candidate.candidate_id)) {
        poolError('adjudication candidate IDs must be unique');
      }
      candidateIds.add(candidate.candidate_id);
      if (!isLabel(candidate?.final)) {
        poolError(`candidate ${candidate?.candidate_id ?? 'unknown'} has no final judgment`);
      }
      if (!Array.isArray(candidate.judgments)
        || candidate.judgments.length !== adjudication.reviewers.length) {
        poolError('completed adjudication must retain every reviewer judgment');
      }
      const judgmentIds = new Set(candidate.judgments.map(judgment => judgment?.reviewer_id));
      if (judgmentIds.size !== reviewerIds.length
        || reviewerIds.some(id => !judgmentIds.has(id))
        || candidate.judgments.some(judgment =>
          !isLabel(judgment)
          || (reviewMode === 'ai' && !isAiVerdictEvidence(
            judgment,
            adjudication.reviewers.find(reviewer => reviewer.id === judgment.reviewer_id),
          )))) {
        poolError('completed adjudication contains invalid reviewer judgments');
      }
      if (candidate.agreement) {
        const agreed = candidate.judgments[0];
        if (candidate.final.relevance !== agreed.relevance
          || candidate.final.citation_supported !== agreed.citation_supported) {
          poolError('agreed candidate final judgment drifted');
        }
      } else if (reviewMode === 'ai'
        && (!isRecord(candidate.adjudication_evidence)
          || typeof candidate.adjudication_rationale !== 'string'
          || candidate.adjudication_evidence.provider_model !== adjudication.adjudicator.model
          || typeof candidate.adjudication_evidence.provider_response_id !== 'string'
          || candidate.adjudication_evidence.provider_response_id.length === 0
          || candidate.adjudication_evidence.verdict_sha256 !== sha256({
            relevance: candidate.final.relevance,
            citation_supported: candidate.final.citation_supported,
            rationale: candidate.adjudication_rationale,
          }))) {
        poolError('AI adjudication evidence does not match the final judgment');
      }
    }
  }
  const expectedAgreement = calculateReviewerAgreement(adjudication.samples, reviewerIds);
  if (JSON.stringify(adjudication.reviewer_agreement) !== JSON.stringify(expectedAgreement)) {
    poolError('completed adjudication reviewer agreement does not match retained judgments');
  }
  return adjudication;
}

export function validateSearchPool(pool) {
  validatePool(pool);
  const sourceSystemIds = pool.source_captures.map(source => source?.system_id);
  if (sourceSystemIds.some(systemId =>
    typeof systemId !== 'string' || !SYSTEM_ID.test(systemId))
    || new Set(sourceSystemIds).size !== sourceSystemIds.length) {
    poolError('source system IDs must be unique stable lowercase identifiers');
  }
  const sourceSystems = new Set(sourceSystemIds);
  const sampleIds = pool.samples.map(sample => sample?.id);
  if (sampleIds.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(sampleIds).size !== sampleIds.length) {
    poolError('sample IDs must be unique');
  }
  for (const sample of pool.samples) {
    if (!Array.isArray(sample?.candidates)) {
      poolError(`sample ${sample?.id ?? 'unknown'} candidates are invalid`);
    }
    const candidateIds = new Set();
    for (const candidate of sample.candidates) {
      if (typeof candidate?.candidate_id !== 'string'
        || candidateIds.has(candidate.candidate_id)
        || !Array.isArray(candidate.systems)
        || candidate.systems.length === 0) {
        poolError(`sample ${sample.id} candidate provenance is invalid`);
      }
      candidateIds.add(candidate.candidate_id);
      const candidateSystems = new Set();
      for (const system of candidate.systems) {
        if (!sourceSystems.has(system?.system_id)
          || candidateSystems.has(system.system_id)
          || !Number.isInteger(system.rank)
          || system.rank < 1
          || !/^[a-f0-9]{64}$/.test(system.raw_result_sha256)
          || (system.routing_signals !== undefined
            && !isRoutingSignals(system.routing_signals))) {
          poolError(`candidate ${candidate.candidate_id} system provenance is invalid`);
        }
        candidateSystems.add(system.system_id);
      }
    }
  }
  return pool;
}

function calculateReviewerAgreement(samples, reviewerIds) {
  const relevanceRows = [];
  const citationRows = [];
  for (const sample of samples) {
    for (const candidate of sample.candidates) {
      const byReviewer = new Map(
        candidate.judgments.map(judgment => [judgment.reviewer_id, judgment]),
      );
      relevanceRows.push(reviewerIds.map(id => byReviewer.get(id).relevance));
      citationRows.push(reviewerIds.map(id => byReviewer.get(id).citation_supported));
    }
  }
  const reviewerPairs = [];
  for (let left = 0; left < reviewerIds.length; left += 1) {
    for (let right = left + 1; right < reviewerIds.length; right += 1) {
      reviewerPairs.push([left, right]);
    }
  }
  const relevanceKappas = reviewerPairs
    .map(([left, right]) => quadraticWeightedKappa(
      relevanceRows.map(row => row[left]),
      relevanceRows.map(row => row[right]),
      0,
      3,
    ))
    .filter(value => value !== null);
  const citationKappas = reviewerPairs
    .map(([left, right]) => cohensKappa(
      citationRows.map(row => row[left]),
      citationRows.map(row => row[right]),
    ))
    .filter(value => value !== null);
  return {
    reviewer_pairs: reviewerPairs.length,
    judged_candidates: relevanceRows.length,
    relevance: {
      raw_agreement_percent: rawAgreementPercent(relevanceRows),
      mean_pairwise_quadratic_weighted_kappa: meanOrNull(relevanceKappas),
      defined_pairs: relevanceKappas.length,
    },
    citation_support: {
      raw_agreement_percent: rawAgreementPercent(citationRows),
      mean_pairwise_cohens_kappa: meanOrNull(citationKappas),
      defined_pairs: citationKappas.length,
    },
  };
}

function rawAgreementPercent(rows) {
  if (rows.length === 0) return null;
  const agreements = rows.filter(row => row.every(value => value === row[0])).length;
  return round(agreements / rows.length * 100, 1);
}

function meanOrNull(values) {
  return values.length === 0
    ? null
    : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function cohensKappa(left, right) {
  if (left.length === 0 || left.length !== right.length) return null;
  const categories = [...new Set([...left, ...right])];
  const observed = left.filter((value, index) => value === right[index]).length / left.length;
  const expected = categories.reduce((sum, category) => {
    const leftRate = left.filter(value => value === category).length / left.length;
    const rightRate = right.filter(value => value === category).length / right.length;
    return sum + leftRate * rightRate;
  }, 0);
  return expected === 1 ? null : (observed - expected) / (1 - expected);
}

function quadraticWeightedKappa(left, right, minimum, maximum) {
  if (left.length === 0 || left.length !== right.length || minimum === maximum) return null;
  const range = maximum - minimum;
  const disagreement = (a, b) => ((a - b) / range) ** 2;
  const observed = left.reduce(
    (sum, value, index) => sum + disagreement(value, right[index]),
    0,
  ) / left.length;
  let expected = 0;
  for (let leftValue = minimum; leftValue <= maximum; leftValue += 1) {
    const leftRate = left.filter(value => value === leftValue).length / left.length;
    for (let rightValue = minimum; rightValue <= maximum; rightValue += 1) {
      const rightRate = right.filter(value => value === rightValue).length / right.length;
      expected += leftRate * rightRate * disagreement(leftValue, rightValue);
    }
  }
  return expected === 0 ? null : 1 - observed / expected;
}

function validateCapture(capture, systemId) {
  if (!isRecord(capture)
    || capture.kind !== 'live-capture'
    || !Array.isArray(capture.samples)
    || capture.samples.length === 0) {
    poolError(`${systemId} is not a non-empty live capture`);
  }
  const ids = capture.samples.map(sample => sample?.id);
  if (ids.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(ids).size !== ids.length) {
    poolError(`${systemId} sample IDs must be unique`);
  }
  for (const sample of capture.samples) {
    if (isRecord(sample.response)) {
      if (!Array.isArray(sample.response.results)
        || !isRecord(sample.trace)
        || sample.trace.raw_response_sha256 !== sha256(sample.response)) {
        poolError(`${systemId}/${sample.id} has an invalid response trace`);
      }
    }
  }
}

function validateResult(result, systemId, sampleId, resultIndex) {
  if (!isRecord(result)
    || typeof result.title !== 'string'
    || typeof result.url !== 'string'
    || (result.snippet !== undefined && typeof result.snippet !== 'string')) {
    poolError(`${systemId}/${sampleId} result ${resultIndex + 1} is invalid`);
  }
  getRoutingSignals(result);
}

function getRoutingSignals(result) {
  const values = [result.relevance, result.confidence, result.source_count];
  if (values.some(value => value === undefined)) return null;
  const signals = {
    relevance: result.relevance,
    confidence: result.confidence,
    source_count: result.source_count,
  };
  if (!isRoutingSignals(signals)) {
    poolError('routing signals must contain bounded relevance/confidence and positive source_count');
  }
  return signals;
}

function isRoutingSignals(value) {
  return isRecord(value)
    && Number.isFinite(value.relevance)
    && value.relevance >= 0
    && value.relevance <= 1
    && Number.isFinite(value.confidence)
    && value.confidence >= 0
    && value.confidence <= 1
    && Number.isInteger(value.source_count)
    && value.source_count >= 1;
}

function validatePool(pool) {
  if (!isRecord(pool)
    || pool.kind !== 'pooled-search-capture'
    || !Array.isArray(pool.source_captures)
    || pool.source_captures.length < 2
    || !Array.isArray(pool.samples)
    || pool.samples.length === 0) {
    poolError('source must be a non-empty multi-system pool');
  }
}

function validateCompletedPacket(packet, pool, poolHash) {
  if (!isRecord(packet)
    || packet.kind !== 'blinded-search-review'
    || packet.source_fixture_sha256 !== poolHash
    || !isRecord(packet.reviewer)
    || !['human', 'ai'].includes(packet.reviewer.kind)
    || typeof packet.reviewer.id !== 'string'
    || packet.reviewer.id.length === 0
    || !Number.isFinite(Date.parse(packet.reviewer.completed_at))) {
    poolError('review packet is incomplete or references a different source pool');
  }
  if (packet.reviewer.kind === 'ai') {
    validateAiActor(packet.reviewer, 'reviewer');
  }
  if (!Array.isArray(packet.samples) || packet.samples.length !== pool.samples.length) {
    poolError('review packet samples do not match the source pool');
  }
  for (const poolSample of pool.samples) {
    const sample = packet.samples.find(candidate => candidate.id === poolSample.id);
    if (!sample || !Array.isArray(sample.candidates)
      || sample.candidates.length !== poolSample.candidates.length) {
      poolError(`review packet sample ${poolSample.id} does not cover the pool`);
    }
    const poolCandidates = new Map(
      poolSample.candidates.map(candidate => [candidate.candidate_id, candidate]),
    );
    for (const candidate of sample.candidates) {
      const pooled = poolCandidates.get(candidate?.candidate_id);
      if (!pooled
        || candidate.url !== pooled.url
        || !isLabel(candidate)
        || (packet.reviewer.kind === 'ai'
          && !isAiVerdictEvidence(candidate, packet.reviewer))) {
        poolError(`review packet candidate ${candidate?.candidate_id ?? 'unknown'} is incomplete`);
      }
      poolCandidates.delete(candidate.candidate_id);
    }
    if (poolCandidates.size > 0) {
      poolError(`review packet sample ${poolSample.id} omits candidates`);
    }
  }
}

function validateAiActor(actor, role) {
  const derivedFamily = typeof actor?.model === 'string'
    ? actor.model.replace(/-\d{4}-\d{2}-\d{2}$/u, '')
    : null;
  if (!isRecord(actor)
    || actor.kind !== 'ai'
    || typeof actor.provider !== 'string'
    || actor.provider.length === 0
    || typeof actor.model !== 'string'
    || actor.model.length === 0
    || typeof actor.model_family !== 'string'
    || actor.model_family.length === 0
    || actor.model_family !== derivedFamily
    || actor.id !== `ai:${actor.provider}:${actor.model}`
    || actor.temperature !== 0
    || actor.prompt_version !== AI_REVIEW_PROMPT_VERSION
    || actor.prompt_sha256 !== AI_REVIEW_PROMPT_SHA256) {
    poolError(`completed AI ${role} metadata is invalid`);
  }
}

function isAiVerdictEvidence(value, actor) {
  return isRecord(value)
    && typeof value.rationale === 'string'
    && value.rationale.length > 0
    && isRecord(value.judge_evidence)
    && value.judge_evidence.provider_model === actor?.model
    && typeof value.judge_evidence.provider_response_id === 'string'
    && value.judge_evidence.provider_response_id.length > 0
    && /^[a-f0-9]{64}$/.test(value.judge_evidence.request_sha256)
    && /^[a-f0-9]{64}$/.test(value.judge_evidence.provider_response_sha256)
    && value.judge_evidence.verdict_sha256 === sha256({
      relevance: value.relevance,
      citation_supported: value.citation_supported,
      rationale: value.rationale,
    });
}

function isLabel(value) {
  return isRecord(value)
    && Number.isInteger(value.relevance)
    && value.relevance >= 0
    && value.relevance <= 3
    && typeof value.citation_supported === 'boolean';
}
