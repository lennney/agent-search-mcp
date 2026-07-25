import { createHash } from 'node:crypto';

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
          candidate.systems.push({
            system_id: systemId,
            rank: resultIndex + 1,
            raw_result_sha256: sha256(result),
          });
          candidatesByUrl.set(canonicalUrl, candidate);
        }
      }
      systemRuns.push({
        system_id: systemId,
        status: isRecord(sample.response) ? 'success' : 'failed',
        duration_ms: sample.duration_ms,
        raw_response_sha256: sample.trace?.raw_response_sha256 ?? null,
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
  validatePool(pool);
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
  const reviewers = sortedPackets.map(packet => ({
    id: packet.reviewer.id,
    kind: 'human',
    reviewer_slot: packet.reviewer_slot,
  }));
  if (new Set(reviewers.map(reviewer => reviewer.id)).size !== reviewers.length) {
    poolError('completed reviews require distinct human reviewer IDs');
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
          return {
            reviewer_id: reviewers[index].id,
            relevance: reviewed.relevance,
            citation_supported: reviewed.citation_supported,
          };
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
    status: 'pending-adjudication',
    summary: {
      candidates: agreements + disagreements,
      agreements,
      disagreements,
    },
    samples,
  };
}

export function validateCompletedAdjudication(adjudication) {
  if (!isRecord(adjudication)
    || adjudication.kind !== 'search-review-adjudication'
    || adjudication.status !== 'completed') {
    poolError('adjudication status must be completed');
  }
  if (!isRecord(adjudication.adjudicator)
    || adjudication.adjudicator.kind !== 'human'
    || typeof adjudication.adjudicator.id !== 'string'
    || adjudication.adjudicator.id.length === 0
    || !Number.isFinite(Date.parse(adjudication.adjudicator.completed_at))) {
    poolError('completed adjudication requires a human adjudicator and timestamp');
  }
  if (!Array.isArray(adjudication.reviewers)
    || adjudication.reviewers.length < 2
    || !Array.isArray(adjudication.samples)) {
    poolError('completed adjudication must retain two reviewers and samples');
  }
  const reviewerIds = adjudication.reviewers.map(reviewer => reviewer?.id);
  if (reviewerIds.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(reviewerIds).size !== reviewerIds.length
    || adjudication.reviewers.some(reviewer => reviewer?.kind !== 'human')) {
    poolError('completed adjudication must retain distinct human reviewers');
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
        || candidate.judgments.some(judgment => !isLabel(judgment))) {
        poolError('completed adjudication contains invalid reviewer judgments');
      }
    }
  }
  return adjudication;
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
    || packet.reviewer.kind !== 'human'
    || typeof packet.reviewer.id !== 'string'
    || packet.reviewer.id.length === 0
    || !Number.isFinite(Date.parse(packet.reviewer.completed_at))) {
    poolError('review packet is incomplete or references a different source pool');
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
        || !isLabel(candidate)) {
        poolError(`review packet candidate ${candidate?.candidate_id ?? 'unknown'} is incomplete`);
      }
      poolCandidates.delete(candidate.candidate_id);
    }
    if (poolCandidates.size > 0) {
      poolError(`review packet sample ${poolSample.id} omits candidates`);
    }
  }
}

function isLabel(value) {
  return isRecord(value)
    && Number.isInteger(value.relevance)
    && value.relevance >= 0
    && value.relevance <= 3
    && typeof value.citation_supported === 'boolean';
}
