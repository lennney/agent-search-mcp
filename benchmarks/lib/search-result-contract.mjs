function resultContractError(message) {
  throw new Error(`Invalid search result: ${message}`);
}

export function canonicalizeSearchResultUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    resultContractError(`URL is invalid: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    resultContractError(`URL must use HTTP(S): ${value}`);
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
  return `${url.protocol}//${url.host.toLowerCase()}${pathname}${query ? `?${query}` : ''}`;
}
