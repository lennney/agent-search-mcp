import pino from 'pino';

// MCP servers must use stderr for logs — stdout is reserved for JSON-RPC
const defaultLogLevel = process.env.NODE_ENV === 'test' ? 'silent' : 'info';

export const logger = pino({
  level: process.env.LOG_LEVEL || defaultLogLevel,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: 'agent-search-mcp' },
}, pino.destination(2)); // fd 2 = stderr
