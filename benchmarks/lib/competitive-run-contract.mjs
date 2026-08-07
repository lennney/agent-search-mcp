import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/u;
const DEFAULT_MAX_QUALIFICATION_AGE_MS = 30 * 60 * 1000;

function fail(message) {
  throw new Error(`Invalid competitive run contract: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createAgentSearchQualificationProfile(systemId, engines) {
  if (typeof systemId !== 'string' || systemId.length === 0
    || !Array.isArray(engines) || engines.length === 0
    || engines.some(engine => typeof engine !== 'string' || engine.length === 0)
    || new Set(engines).size !== engines.length) {
    fail('system ID and unique engine list are required');
  }
  return {
    schema_version: 1,
    system_id: systemId,
    system_version: 'repository-build',
    result_limit: 5,
    retry_limit: 0,
    options: {
      provider_mode: 'free_only',
      routing: 'waterfall',
      engines: [...engines],
      enrichment: false,
      query_expansion: false,
    },
  };
}

export function competitiveProfileSha256(profile) {
  if (!isRecord(profile)) fail('profile is required');
  return sha256(JSON.stringify(profile));
}

export function assertCompetitiveQualification(report, expectedProfile, options = {}) {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_QUALIFICATION_AGE_MS;
  if (!Number.isFinite(now) || !Number.isInteger(maxAgeMs) || maxAgeMs < 1) {
    fail('qualification clock and maximum age are invalid');
  }
  if (!isRecord(report)
    || report.kind !== 'search-runner-qualification'
    || report.capture_status !== 'complete'
    || report.readiness?.status !== 'ready'
    || !Array.isArray(report.systems)) {
    fail('qualification must be complete and ready');
  }
  const observedAt = Date.parse(report.observed_at);
  if (!Number.isFinite(observedAt)
    || observedAt > now + 5 * 60 * 1000
    || now - observedAt > maxAgeMs) {
    fail('qualification is missing, future-dated, or stale');
  }
  const expectedHash = competitiveProfileSha256(expectedProfile);
  const qualifiedSystem = report.systems.find(system => (
    system?.system_id === expectedProfile.system_id
  ));
  if (!isRecord(qualifiedSystem)
    || !SHA256.test(qualifiedSystem.profile_sha256 ?? '')
    || qualifiedSystem.profile_sha256 !== expectedHash) {
    fail(`qualification profile differs for ${expectedProfile.system_id}`);
  }
  return {
    qualification_sha256: sha256(JSON.stringify(report)),
    profile_sha256: expectedHash,
    observed_at: report.observed_at,
  };
}
