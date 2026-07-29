type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function containsBotChallenge(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some(item => containsBotChallenge(item, seen));
  }

  const record = value as RecordValue;
  if (record.type === 'bot_challenge' || record.failureType === 'bot_challenge') {
    return true;
  }
  return ['partialFailures', 'failures', 'error', 'result', 'structuredContent']
    .some(key => containsBotChallenge(record[key], seen));
}

export function isBotChallengeFailure(value: unknown): boolean {
  return containsBotChallenge(value, new Set<object>());
}

export function shouldStopAfterLiveOutcome(value: unknown): boolean {
  return isBotChallengeFailure(value);
}

function unwrapOutcome(value: unknown): RecordValue | undefined {
  const root = asRecord(value);
  if (!root) return undefined;
  return asRecord(root.structuredContent)
    ?? asRecord(root.result)
    ?? root;
}

function isExtractOutcome(root: RecordValue): boolean {
  return root.kind === 'extract'
    || root.operation === 'free_extract'
    || root.tool === 'free_extract';
}

function isProviderProbe(root: RecordValue): boolean {
  return typeof root.engine === 'string'
    || typeof root.provider === 'string'
    || root.providerProbe === true
    || root.kind === 'provider'
    || root.kind === 'provider_probe'
    || root.operation === 'free_search'
    || root.tool === 'free_search';
}

export function hasSuccessfulProviderProbe(value: unknown): boolean {
  const root = unwrapOutcome(value);
  if (!root || isExtractOutcome(root) || isBotChallengeFailure(root)) return false;
  if (root.success === false || root.status === 'failed' || root.error) return false;
  const results = root.results;
  return isProviderProbe(root) && Array.isArray(results) && results.length > 0;
}
