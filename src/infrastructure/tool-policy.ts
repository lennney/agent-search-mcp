import { SearchProvider } from '../types.js';

export class EnginePolicy {
  private allowed: Set<SearchProvider> | null;
  private denied: Set<SearchProvider>;

  constructor(allowedEngines?: string, deniedEngines?: string) {
    this.allowed = allowedEngines ? new Set(allowedEngines.split(',').map(s => s.trim()) as SearchProvider[]) : null;
    this.denied = new Set(deniedEngines ? deniedEngines.split(',').map(s => s.trim()) as SearchProvider[] : []);
  }

  isAllowed(engine: SearchProvider): boolean {
    if (this.denied.has(engine)) return false;
    if (this.allowed && !this.allowed.has(engine)) return false;
    return true;
  }

  filterEngines(engines: SearchProvider[]): SearchProvider[] {
    return engines.filter(e => this.isAllowed(e));
  }

  getAvailableEngines(allEngines: SearchProvider[]): SearchProvider[] {
    return this.filterEngines(allEngines);
  }
}

/**
 * Tool visibility policy — controls which MCP tools are registered.
 * Mirrors EnginePolicy pattern: allowlist + denylist, deny wins.
 */
export class ToolPolicy {
  private allowed: Set<string> | null;
  private denied: Set<string>;

  constructor(enabledTools?: string[], disabledTools?: string[]) {
    this.allowed = (enabledTools && enabledTools.length > 0)
      ? new Set(enabledTools.map(t => t.trim()).filter(Boolean))
      : null;
    this.denied = new Set(
      (disabledTools || []).map(t => t.trim()).filter(Boolean)
    );
  }

  /** Check whether a tool should be registered and visible to the agent. */
  isToolEnabled(name: string): boolean {
    if (this.denied.has(name)) return false;
    if (this.allowed && !this.allowed.has(name)) return false;
    return true;
  }
}