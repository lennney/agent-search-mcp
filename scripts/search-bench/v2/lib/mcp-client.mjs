/**
 * Generic MCP Client — v2 Benchmark
 * 
 * Connects to any MCP server (stdio or HTTP), auto-discovers tools,
 * and executes search queries.
 * 
 * Usage:
 *   const client = await McpClient.connect({ cmd: 'npx agent-search-mcp' })
 *   const client = await McpClient.connect({ url: 'https://mcp.exa.ai/mcp', apiKey: '...' })
 *   const tools = await client.listTools()
 *   const result = await client.callTool('search', { query: '...' })
 */

import { spawn } from 'child_process';

export class McpClient {
  #proc = null;
  #id = 0;
  #pending = new Map();
  #buffer = '';
  #connected = false;
  #httpUrl = null;
  #httpKey = null;

  static async connect(opts) {
    const client = new McpClient();
    if (opts.cmd) {
      await client.#connectStdio(opts.cmd, opts.env);
    } else if (opts.url) {
      await client.#connectHttp(opts.url, opts.apiKey);
    } else {
      throw new Error('Must provide cmd (stdio) or url (HTTP)');
    }
    return client;
  }

  async #connectStdio(cmd, env = {}) {
    const parts = cmd.split(/\s+/);
    this.#proc = spawn(parts[0], parts.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env, LOG_LEVEL: 'error' },
    });
    this.#proc.stderr.on('data', () => {});
    this.#proc.stdout.on('data', (chunk) => this.#onData(chunk));
    this.#proc.on('exit', (code) => {
      // Reject all pending on unexpected exit
      for (const [id, { reject }] of this.#pending) {
        reject(new Error(`Process exited with code ${code}`));
      }
      this.#pending.clear();
    });
    await this.#init();
  }

  async #connectHttp(url, apiKey) {
    this.#httpUrl = url;
    this.#httpKey = apiKey;
    // For HTTP remote, we'll proxy through the MCP inspector protocol
    // Note: this is a simplified implementation that works with Streamable HTTP
    this.#connected = true;
    await this.#init();
  }

  async #init() {
    await this.call('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'mcp-bench-v2', version: '2.0.0' },
    });
    // Send initialized notification (no response expected)
    this.#send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    await sleep(200);
    this.#connected = true;
  }

  #onData(chunk) {
    this.#buffer += chunk.toString();
    const lines = this.#buffer.split('\n');
    this.#buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const cb = this.#pending.get(msg.id);
        if (cb) {
          this.#pending.delete(msg.id);
          clearTimeout(cb.timer);
          if (msg.error) cb.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else cb.resolve(msg);
        }
      } catch { /* partial JSON */ }
    }
  }

  #send(msg) {
    if (this.#proc) {
      this.#proc.stdin.write(JSON.stringify(msg) + '\n');
    } else if (this.#httpUrl) {
      // For HTTP mode, we need to POST
      // This is a placeholder - full HTTP client would need proper MCP HTTP transport
      throw new Error('HTTP mode not yet implemented in v2. Use stdio mode.');
    }
  }

  async call(method, params = {}) {
    if (!this.#proc && !this.#httpUrl) throw new Error('Not connected');
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`MCP call timed out: ${method}`));
      }, 30000);
      this.#pending.set(id, { resolve, reject, timer });
      this.#send({ jsonrpc: '2.0', id, method, params });
    });
  }

  async listTools() {
    const resp = await this.call('tools/list');
    return resp?.result?.tools || [];
  }

  async findSearchTool() {
    const tools = await this.listTools();
    // Try to find a search tool by name or parameter pattern
    const searchCandidates = tools.filter(t => {
      const name = (t.name || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const hasQueryParam = t.inputSchema?.properties?.query || 
                            t.inputSchema?.properties?.q ||
                            t.inputSchema?.properties?.search_query;
      const isSearch = name.includes('search') || name.includes('query') || 
                       name.includes('find') || desc.includes('search');
      return isSearch && hasQueryParam;
    });

    if (searchCandidates.length > 0) return searchCandidates[0];

    // Fallback: first tool with a "query" or "q" string param
    const queryTools = tools.filter(t => 
      t.inputSchema?.properties?.query?.type === 'string' ||
      t.inputSchema?.properties?.q?.type === 'string'
    );
    if (queryTools.length > 0) return queryTools[0];

    // Last resort: first tool
    return tools[0] || null;
  }

  async search(query, count = 5, extraParams = {}) {
    const tool = await this.findSearchTool();
    if (!tool) throw new Error('No search-capable tool found');

    const props = tool.inputSchema?.properties || {};
    const args = { ...extraParams };

    // Map common parameter names
    if (props.query) args.query = query;
    else if (props.q) args.q = query;
    else if (props.search_query) args.search_query = query;
    else args.query = query; // best effort

    if (props.count) args.count = count;
    else if (props.limit) args.limit = count;
    else if (props.max_results) args.max_results = count;
    else if (props.numResults) args.numResults = count;

    const resp = await this.call('tools/call', { name: tool.name, arguments: args });
    const text = resp?.result?.content?.[0]?.text || '';
    return { raw: text, tool: tool.name };
  }

  async close() {
    if (this.#proc) {
      this.#proc.kill();
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
