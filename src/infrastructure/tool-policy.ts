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