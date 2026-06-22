export interface Config {
  mode: 'stdio' | 'http' | 'both';
  port: number;
  enableCors: boolean;
  corsOrigin: string;
  useProxy: boolean;
  proxyUrl: string;
  defaultEngine: string;
  allowedEngines: string[];
}

export function loadConfig(): Config {
  return {
    mode: (process.env.MODE as Config['mode']) || 'stdio',
    port: parseInt(process.env.PORT || '3000', 10),
    enableCors: process.env.ENABLE_CORS === 'true',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    useProxy: process.env.USE_PROXY === 'true',
    proxyUrl: process.env.PROXY_URL || 'http://127.0.0.1:7890',
    defaultEngine: process.env.DEFAULT_ENGINE || 'duckduckgo',
    allowedEngines: process.env.ALLOWED_ENGINES
      ? process.env.ALLOWED_ENGINES.split(',').map(e => e.trim())
      : [],
  };
}
