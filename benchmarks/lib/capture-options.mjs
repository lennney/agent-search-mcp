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
