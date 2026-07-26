export interface Config {
  mode: 'stdio' | 'http' | 'both';
  port: number;
  enableCors: boolean;
  corsOrigin: string;
  allowedOrigins: string[];
  httpAuthToken: string;
  httpAllowUnauthenticated: boolean;
  useProxy: boolean;
  proxyUrl: string;
  defaultEngine: string;
  allowedEngines: string[];
  ALLOWED_ENGINES: string;
  DENIED_ENGINES: string;
  enabledTools: string[];
  disabledTools: string[];
  outputStyle: 'normal' | 'compact';
  snippetLength: number;
  maxFullResults: number;
  evidenceBudgetChars: number;
  searchBudgetMaxCalls: number;
  searchBudgetMaxElapsedMs: number;
  searchBudgetMaxResults: number;
  minConfidence: number;
  minSourceCount: number;
  semanticDedup: boolean;
  dedupThreshold: number;
  dedupModel: string;
  semanticRerank: boolean;
  rerankTopK: number;
  rerankModel: string;
}

export function loadConfig(): Config {
  const rawMode = process.env.MODE;
  const mode: Config['mode'] = (rawMode === 'stdio' || rawMode === 'http' || rawMode === 'both') ? rawMode : 'stdio';
  
  const rawPort = parseInt(process.env.PORT || '3000', 10);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000;
  const legacyMinConfidence = parseFloat(process.env.MIN_CONFIDENCE || '0') || 0;
  const explicitMinSourceCount = parseInt(process.env.MIN_SOURCE_COUNT || '', 10);
  const rawEvidenceBudget = parseInt(process.env.EVIDENCE_BUDGET_CHARS || '1200', 10);
  const evidenceBudgetChars = Math.max(
    200,
    Math.min(20_000, Number.isFinite(rawEvidenceBudget) ? rawEvidenceBudget : 1200),
  );
  const boundedInteger = (name: string, fallback: number, min: number, max: number): number => {
    const parsed = parseInt(process.env[name] || String(fallback), 10);
    return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
  };
  
  return {
    mode,
    port,
    enableCors: process.env.ENABLE_CORS === 'true',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
    httpAuthToken: process.env.HTTP_AUTH_TOKEN || '',
    httpAllowUnauthenticated: process.env.HTTP_ALLOW_UNAUTHENTICATED === 'true',
    useProxy: process.env.USE_PROXY === 'true',
    proxyUrl: process.env.PROXY_URL || 'http://127.0.0.1:7890',
    defaultEngine: process.env.DEFAULT_ENGINE || 'duckduckgo',
    allowedEngines: process.env.ALLOWED_ENGINES
      ? process.env.ALLOWED_ENGINES.split(',').map(e => e.trim())
      : [],
    ALLOWED_ENGINES: process.env.ALLOWED_ENGINES || '',
    DENIED_ENGINES: process.env.DENIED_ENGINES || '',
    enabledTools: process.env.ENABLED_TOOLS
      ? process.env.ENABLED_TOOLS.split(',').map(t => t.trim()).filter(Boolean)
      : [],
    disabledTools: process.env.DISABLED_TOOLS
      ? process.env.DISABLED_TOOLS.split(',').map(t => t.trim()).filter(Boolean)
      : [],
    outputStyle: process.env.OUTPUT_STYLE === 'compact' ? 'compact' : 'normal',
    snippetLength: parseInt(process.env.SNIPPET_LENGTH || '200', 10) || 200,
    maxFullResults: parseInt(process.env.MAX_FULL_RESULTS || '3', 10) || 3,
    evidenceBudgetChars,
    searchBudgetMaxCalls: boundedInteger('SEARCH_BUDGET_MAX_CALLS', 16, 1, 100),
    searchBudgetMaxElapsedMs: boundedInteger('SEARCH_BUDGET_MAX_ELAPSED_MS', 30_000, 1_000, 120_000),
    searchBudgetMaxResults: boundedInteger('SEARCH_BUDGET_MAX_RESULTS', 100, 1, 500),
    minConfidence: legacyMinConfidence <= 1 ? Math.max(legacyMinConfidence, 0) : 0,
    minSourceCount: Math.min(12, Number.isFinite(explicitMinSourceCount)
      ? Math.max(explicitMinSourceCount, 1)
      : legacyMinConfidence > 1 ? Math.ceil(legacyMinConfidence) : 1),
    semanticDedup: process.env.SEMANTIC_DEDUP === 'true',
    dedupThreshold: parseFloat(process.env.DEDUP_THRESHOLD || '0.85') || 0.85,
    dedupModel: process.env.DEDUP_MODEL || 'minishlab/M2V_base_output',
    semanticRerank: process.env.SEMANTIC_RERANK === 'true',
    rerankTopK: parseInt(process.env.RERANK_TOP_K || '5', 10) || 5,
    rerankModel: process.env.RERANK_MODEL || 'minishlab/M2V_base_output',
  };
}
