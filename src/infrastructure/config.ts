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
  providerCooldownStorePath: string;
  searchCacheDirectory: string;
  searchCacheTtlMs: number;
  searchCacheMaxEntries: number;
  minConfidence: number;
  minSourceCount: number;
  semanticDedup: boolean;
  dedupThreshold: number;
  dedupModel: string;
  semanticRerank: boolean;
  rerankTopK: number;
  rerankModel: string;
}

interface BoundedIntegerConfig {
  environment: string;
  fallback: number;
  min: number;
  max: number;
}

export const boundedIntegerConfig = {
  evidenceBudgetChars: {
    environment: 'EVIDENCE_BUDGET_CHARS',
    fallback: 1200,
    min: 200,
    max: 20_000,
  },
  searchBudgetMaxCalls: {
    environment: 'SEARCH_BUDGET_MAX_CALLS',
    fallback: 16,
    min: 1,
    max: 100,
  },
  searchBudgetMaxElapsedMs: {
    environment: 'SEARCH_BUDGET_MAX_ELAPSED_MS',
    fallback: 30_000,
    min: 1_000,
    max: 120_000,
  },
  searchBudgetMaxResults: {
    environment: 'SEARCH_BUDGET_MAX_RESULTS',
    fallback: 100,
    min: 1,
    max: 500,
  },
  searchCacheTtlMs: {
    environment: 'SEARCH_CACHE_TTL_MS',
    fallback: 60_000,
    min: 1_000,
    max: 86_400_000,
  },
  searchCacheMaxEntries: {
    environment: 'SEARCH_CACHE_MAX_ENTRIES',
    fallback: 1_000,
    min: 1,
    max: 10_000,
  },
} as const satisfies Record<string, BoundedIntegerConfig>;

export const publicCapabilityControls = [
  {
    environment: 'ENABLED_TOOLS / DISABLED_TOOLS',
    defaultValue: 'all / none',
    description: {
      en: 'Tool registration allowlist and denylist; deny wins',
      zh: '工具注册允许列表和拒绝列表；拒绝优先',
    },
  },
  {
    environment: 'ALLOWED_ENGINES / DENIED_ENGINES',
    defaultValue: 'all / none',
    description: {
      en: 'Engine execution allowlist and denylist; deny wins',
      zh: '引擎执行允许列表和拒绝列表；拒绝优先',
    },
  },
  ...([
    ['searchBudgetMaxCalls', 'Adapter-attempt budget', '适配器尝试次数预算'],
    ['searchBudgetMaxElapsedMs', 'End-to-end elapsed-time budget', '端到端耗时预算'],
    ['searchBudgetMaxResults', 'Admitted raw-result budget', '接纳原始结果数量预算'],
    ['evidenceBudgetChars', 'Evidence-character budget', '证据字符预算'],
  ] as const).map(([key, en, zh]) => ({
    environment: boundedIntegerConfig[key].environment,
    defaultValue: String(boundedIntegerConfig[key].fallback),
    description: { en, zh },
  })),
] as const;

export function loadConfig(): Config {
  const rawMode = process.env.MODE;
  const mode: Config['mode'] = (rawMode === 'stdio' || rawMode === 'http' || rawMode === 'both') ? rawMode : 'stdio';
  
  const rawPort = parseInt(process.env.PORT || '3000', 10);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000;
  const legacyMinConfidence = parseFloat(process.env.MIN_CONFIDENCE || '0') || 0;
  const explicitMinSourceCount = parseInt(process.env.MIN_SOURCE_COUNT || '', 10);
  const boundedInteger = (definition: BoundedIntegerConfig): number => {
    const parsed = parseInt(
      process.env[definition.environment] || String(definition.fallback),
      10,
    );
    return Math.max(
      definition.min,
      Math.min(
        definition.max,
        Number.isFinite(parsed) ? parsed : definition.fallback,
      ),
    );
  };
  const evidenceBudgetChars = boundedInteger(
    boundedIntegerConfig.evidenceBudgetChars,
  );
  
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
    searchBudgetMaxCalls: boundedInteger(boundedIntegerConfig.searchBudgetMaxCalls),
    searchBudgetMaxElapsedMs: boundedInteger(boundedIntegerConfig.searchBudgetMaxElapsedMs),
    searchBudgetMaxResults: boundedInteger(boundedIntegerConfig.searchBudgetMaxResults),
    providerCooldownStorePath: process.env.PROVIDER_COOLDOWN_STORE_PATH || '',
    searchCacheDirectory: process.env.SEARCH_CACHE_DIRECTORY || '',
    searchCacheTtlMs: boundedInteger(boundedIntegerConfig.searchCacheTtlMs),
    searchCacheMaxEntries: boundedInteger(boundedIntegerConfig.searchCacheMaxEntries),
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
