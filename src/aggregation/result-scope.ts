/** Returned-URL constraint, not a network egress policy. Domains include subdomains. */
interface ScopeEntry { hostname: string; path: string; port: string }

function parseScope(value: string): ScopeEntry {
  const input = value.trim().replace(/^\*\./, '');
  if (!input || input.startsWith('/') || /[\\?#\s]/.test(input)) {
    throw new Error(`Invalid result scope: ${value}`);
  }
  const candidate = input.includes('://') ? input : `https://${input}`;
  const rawPath = candidate.replace(/^https?:\/\/[^/]+/i, '');
  if (rawPath.split('/').some(segment => /^(?:\.|%2e){1,2}$/i.test(segment))) {
    throw new Error(`Dot segments are not valid result scopes: ${value}`);
  }
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error(`Invalid result scope: ${value}`);
  }
  // Do not collapse repeated slashes: /docs// and // are distinct paths.
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/(?<!\/)\/$/, '');
  return { hostname: url.hostname.toLowerCase().replace(/\.$/, ''), path, port: url.port };
}

export function createResultScope(include?: readonly string[], exclude?: readonly string[]): (url: string) => boolean {
  const included = (include ?? []).map(parseScope);
  const excluded = (exclude ?? []).map(parseScope);
  if (!included.length && !excluded.length) return () => true;
  return (value: string): boolean => {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return false;
      const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
      const matches = (entry: ScopeEntry): boolean =>
        (hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`))
        && (!entry.port || url.port === entry.port)
        && (entry.path === '/' || url.pathname === entry.path
          || url.pathname.startsWith(entry.path.endsWith('/') ? entry.path : `${entry.path}/`));
      return (!included.length || included.some(matches)) && !excluded.some(matches);
    } catch { return false; }
  };
}
