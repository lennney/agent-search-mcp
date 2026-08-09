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

export function parseIntegerOption(value, options) {
  const { name, defaultValue, minimum, maximum } = options;
  if (value === undefined) return defaultValue;
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

export function deriveCaptureRegistry(engineRegistry) {
  if (typeof engineRegistry !== 'object' || engineRegistry === null) {
    throw new Error('engine registry must be an object');
  }
  const capabilities = Object.values(engineRegistry);
  if (capabilities.length === 0
    || capabilities.some(engine => typeof engine?.id !== 'string'
      || typeof engine?.isFree !== 'boolean')) {
    throw new Error('engine registry entries require id and isFree');
  }
  return {
    allEngines: capabilities.map(engine => engine.id),
    freeEngines: capabilities.filter(engine => engine.isFree).map(engine => engine.id),
    optionalCredentialEnvironment: Object.fromEntries(
      capabilities
        .filter(engine => !engine.isFree && typeof engine.credentialEnvironment === 'string')
        .map(engine => [engine.id, engine.credentialEnvironment]),
    ),
  };
}
