import pino from 'pino';

// MCP servers must use stderr for logs — stdout is reserved for JSON-RPC
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: 'agent-search-mcp' },
}, pino.destination(2)); // fd 2 = stderr
