import type { SearchProvider } from '../types.js';

export type SearchProviderMode =
  | 'free_first'
  | 'quality_escalation'
  | 'paid_first'
  | 'free_only';

export interface SearchProviderStage {
  kind: 'free' | 'optional';
  engines: SearchProvider[];
}

export interface SearchProviderPlanOptions {
  mode: SearchProviderMode;
  freeStages: readonly (readonly SearchProvider[])[];
  paidEngines: readonly SearchProvider[];
  hasCredential: (engine: SearchProvider) => boolean;
}

/**
 * Resolve default search stages without performing I/O.
 *
 * `free_first` intentionally excludes optional providers: merely configuring
 * a credential never authorizes a paid request. `quality_escalation` is the
 * explicit free-then-paid mode.
 */
export function createSearchProviderPlan(
  options: SearchProviderPlanOptions,
): SearchProviderStage[] {
  const freeStages = options.freeStages
    .map(engines => ({
      kind: 'free' as const,
      engines: [...new Set(engines)],
    }))
    .filter(stage => stage.engines.length > 0);
  const firstConfiguredPaid = [...new Set(options.paidEngines)]
    .find(options.hasCredential);
  const optionalStage: SearchProviderStage = {
    kind: 'optional',
    engines: firstConfiguredPaid ? [firstConfiguredPaid] : [],
  };

  switch (options.mode) {
    case 'free_only':
    case 'free_first':
      return freeStages;
    case 'paid_first':
      return optionalStage.engines.length > 0
        ? [optionalStage, ...freeStages]
        : freeStages;
    case 'quality_escalation':
      return optionalStage.engines.length > 0
        ? [...freeStages, optionalStage]
        : freeStages;
  }
}
