export type UrlCanonicalizationVersion = 'v1' | 'v2-candidate';

/** Production remains pinned until the candidate is calibrated on pooled qrels. */
export const ACTIVE_URL_CANONICALIZATION_VERSION: UrlCanonicalizationVersion = 'v1';

const TRACKING_PARAMETERS = new Set([
  '_ga',
  '_gl',
  'dclid',
  'fbclid',
  'gclid',
  'msclkid',
  'utm_campaign',
  'utm_content',
  'utm_id',
  'utm_medium',
  'utm_source',
  'utm_term',
]);

function canonicalizeV1(url: URL): string {
  return `${url.hostname}${url.pathname.replace(/\/$/, '')}`.toLowerCase();
}

function canonicalizeV2Candidate(url: URL): string {
  // Keep distinctions whose equivalence needs site-specific evidence: scheme,
  // path case, trailing slash, credentials, fragments and repeated-value order.
  // URL normalizes only standard URL syntax (host case and default ports).
  const parameters = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMETERS.has(key.toLowerCase()))
    // Stable key-only ordering preserves order-sensitive duplicate parameters.
    // Avoid localeCompare: persisted identity must not depend on host locale.
    .sort(([leftKey], [rightKey]) => leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0);
  url.search = new URLSearchParams(parameters).toString();
  return url.href;
}

export function canonicalizeUrl(
  value: string,
  version: UrlCanonicalizationVersion = ACTIVE_URL_CANONICALIZATION_VERSION,
): string {
  try {
    const url = new URL(value);
    return version === 'v1'
      ? canonicalizeV1(url)
      : canonicalizeV2Candidate(url);
  } catch {
    // Invalid URLs have no proven case-insensitive identity. Keep production's
    // legacy behavior until the explicit migration, but do not extend it in v2.
    return version === 'v1' ? value.toLowerCase() : value;
  }
}
