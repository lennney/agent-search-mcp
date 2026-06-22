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
  const rawMode = process.env.MODE;
  const mode: Config['mode'] = (rawMode === 'stdio' || rawMode === 'http' || rawMode === 'both') ? rawMode : 'stdio';
  
  const rawPort = parseInt(process.env.PORT || '3000', 10);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000;
  
  return {
    mode,
    port,
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
