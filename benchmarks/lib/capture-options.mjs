export function parseEngineSelection(value, availableEngines) {
  if (!Array.isArray(availableEngines) || availableEngines.length === 0) {
    throw new Error('availableEngines must be a non-empty array');
  }
  if (value === undefined) return [...availableEngines];

  const selected = [...new Set(value.split(',').map(engine => engine.trim()).filter(Boolean))];
  if (selected.length === 0) {
    throw new Error('--engines must select at least one engine');
  }
  const available = new Set(availableEngines);
  const unknown = selected.filter(engine => !available.has(engine));
  if (unknown.length > 0) {
    throw new Error(`Unknown benchmark engines: ${unknown.join(', ')}`);
  }
  return selected;
}

export function selectBenchmarkQueries(querySet, requestedLimit) {
  const allQueries = Array.isArray(querySet) ? querySet : querySet?.queries;
  if (!Array.isArray(allQueries) || allQueries.length === 0) {
    throw new Error('query set must contain a non-empty array');
  }
  const limit = requestedLimit ?? allQueries.length;
  if (!Number.isInteger(limit) || limit < 1 || limit > allQueries.length) {
    throw new Error(`query limit must be an integer from 1 to ${allQueries.length}`);
  }
  if (limit === allQueries.length) return [...allQueries];

  const english = allQueries.filter(item =>
    (typeof item === 'string' ? 'unknown' : item.language || item.lang) !== 'zh');
  const chinese = allQueries.filter(item =>
    (typeof item === 'string' ? 'unknown' : item.language || item.lang) === 'zh');
  const englishLimit = Math.min(english.length, Math.ceil(limit / 2));
  const chineseLimit = Math.min(chinese.length, limit - englishLimit);
  const selected = [
    ...english.slice(0, englishLimit),
    ...chinese.slice(0, chineseLimit),
  ];
  if (selected.length < limit) {
    const selectedSet = new Set(selected);
    selected.push(...allQueries
      .filter(item => !selectedSet.has(item))
      .slice(0, limit - selected.length));
  }
  return selected;
}
