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
  const path = url.pathname === '/'
    ? ''
    : url.pathname.replace(/\/$/, '');
  const parameters = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMETERS.has(key.toLowerCase()))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));
  const search = new URLSearchParams(parameters).toString();
  return `${url.host.toLowerCase()}${path}${search ? `?${search}` : ''}`;
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
    return value.toLowerCase();
  }
}
