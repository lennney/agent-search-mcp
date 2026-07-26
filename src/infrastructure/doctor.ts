import { spawnSync } from 'node:child_process';

import {
  engines,
  freeEngines,
  optionalEngineCredentialEnvironment,
} from '../engines/index.js';
import type { SearchProvider } from '../types.js';
import { inspectEngineProxyConfiguration } from './engine-http.js';
import { EnginePolicy } from './tool-policy.js';

export type DoctorStatus = 'present' | 'missing' | 'invalid';

export interface DoctorCheck {
  status: DoctorStatus;
  required: boolean;
  provenance: string[];
}

export interface DoctorProviderCheck extends DoctorCheck {
  id: SearchProvider;
  name: string;
  kind: 'zero-key' | 'optional-api';
}

export interface DoctorReport {
  schema_version: 'doctor-report-v1';
  scope: 'local-configuration';
  status: DoctorStatus;
  runtime: {
    node: DoctorCheck & {
      detected: string;
      requirement: '>=18.17.0';
    };
    platform: DoctorCheck & {
      detected: string;
    };
  };
  providers: DoctorProviderCheck[];
  optional_dependencies: Array<DoctorCheck & {
    id: 'semantic-bridge';
    enabled: boolean;
    requirement: 'python3 with model2vec and numpy';
  }>;
  configuration: Array<DoctorCheck & {
    id:
      | 'engine-policy'
      | 'zero-key-search'
      | 'duckduckgo-proxy'
      | 'sogou-proxy'
      | 'semantic-flags'
      | 'request-budget';
  }>;
}

export interface DoctorOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  nodeVersion?: string;
  platform?: string;
  semanticProbe?: () => boolean;
}

const ALL_ENGINE_IDS = Object.keys(engines) as SearchProvider[];
const ALL_ENGINE_ID_SET = new Set<string>(ALL_ENGINE_IDS);
const SEMANTIC_FLAGS = ['SEMANTIC_DEDUP', 'SEMANTIC_RERANK'] as const;

export function createDoctorReport(
  options: DoctorOptions = {},
): DoctorReport {
  const environment = options.environment ?? process.env;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const platform = options.platform ?? process.platform;
  const enginePolicy = new EnginePolicy(
    environment.ALLOWED_ENGINES,
    environment.DENIED_ENGINES,
  );
  const policyInspection = inspectEnginePolicy(environment);
  const providers = ALL_ENGINE_IDS.map(engine =>
    inspectProvider(engine, enginePolicy, environment));
  const semanticFlags = inspectSemanticFlags(environment);
  const semanticEnabled = SEMANTIC_FLAGS.some(
    environmentName => environment[environmentName] === 'true',
  );
  const semanticDependency = inspectSemanticDependency(
    semanticEnabled,
    semanticFlags.provenance,
    options.semanticProbe ?? (() => probeSemanticBridge(environment)),
  );
  const configuration: DoctorReport['configuration'] = [
    {
      id: 'engine-policy',
      status: policyInspection.status,
      required: true,
      provenance: policyInspection.provenance,
    },
    {
      id: 'zero-key-search',
      status: policyInspection.status === 'invalid'
        ? 'invalid'
        : freeEngines.some(engine => enginePolicy.isAllowed(engine))
          ? 'present'
          : 'missing',
      required: true,
      provenance: policyInspection.provenance,
    },
    {
      id: 'duckduckgo-proxy',
      ...inspectEngineProxyConfiguration('duckduckgo', environment),
      required: false,
    },
    {
      id: 'sogou-proxy',
      ...inspectEngineProxyConfiguration('sogou', environment),
      required: false,
    },
    {
      id: 'semantic-flags',
      ...semanticFlags,
      required: true,
    },
    {
      id: 'request-budget',
      ...inspectRequestBudget(environment),
      required: true,
    },
  ];
  const runtime: DoctorReport['runtime'] = {
    node: {
      status: inspectNodeVersion(nodeVersion),
      required: true,
      provenance: ['runtime:process.versions.node'],
      detected: nodeVersion,
      requirement: '>=18.17.0',
    },
    platform: {
      status: platform ? 'present' : 'missing',
      required: true,
      provenance: ['runtime:process.platform'],
      detected: platform,
    },
  };
  const report: DoctorReport = {
    schema_version: 'doctor-report-v1',
    scope: 'local-configuration',
    status: 'present',
    runtime,
    providers,
    optional_dependencies: [semanticDependency],
    configuration,
  };
  report.status = summarizeStatus(report);
  return report;
}

function inspectRequestBudget(
  environment: Readonly<Record<string, string | undefined>>,
): DoctorCheck {
  const bounds = [
    ['SEARCH_BUDGET_MAX_CALLS', 1, 100],
    ['SEARCH_BUDGET_MAX_ELAPSED_MS', 1_000, 120_000],
    ['SEARCH_BUDGET_MAX_RESULTS', 1, 500],
    ['EVIDENCE_BUDGET_CHARS', 200, 20_000],
  ] as const;
  const configured = bounds.filter(([name]) => environment[name] !== undefined);
  const invalid = configured.some(([name, min, max]) => {
    const value = Number(environment[name]);
    return !Number.isInteger(value) || value < min || value > max;
  });
  return {
    status: invalid ? 'invalid' : 'present',
    required: true,
    provenance: configured.length > 0
      ? configured.map(([name]) => `environment:${name}`)
      : ['built-in:request-budget-defaults'],
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    `Agent Search Doctor (${report.schema_version})`,
    'Scope: local configuration (no network probe)',
    `Overall: ${report.status}`,
    '',
    'Runtime:',
    `  node ${report.runtime.node.requirement}: ${report.runtime.node.status}`
      + ` (${report.runtime.node.detected})`,
    `  platform: ${report.runtime.platform.status}`
      + ` (${report.runtime.platform.detected})`,
    '',
    'Providers:',
    ...report.providers.map(provider =>
      `  ${provider.id} [${provider.kind}]: ${provider.status}`
      + ` (${provider.provenance.join(', ')})`),
    '',
    'Optional dependencies:',
    ...report.optional_dependencies.map(dependency =>
      `  ${dependency.id} [${dependency.requirement}]: ${dependency.status}`
      + ` (${dependency.provenance.join(', ')})`),
    '',
    'Configuration:',
    ...report.configuration.map(check =>
      `  ${check.id}: ${check.status}`
      + ` (${check.provenance.join(', ')})`),
    '',
    'Credential and token values are never displayed.',
  ];
  return lines.join('\n');
}

function inspectProvider(
  engine: SearchProvider,
  policy: EnginePolicy,
  environment: Readonly<Record<string, string | undefined>>,
): DoctorProviderCheck {
  if (!policy.isAllowed(engine)) {
    return {
      id: engine,
      name: engines[engine].name,
      kind: engines[engine].isFree ? 'zero-key' : 'optional-api',
      status: 'missing',
      required: false,
      provenance: [
        environment.DENIED_ENGINES
          ? 'environment:DENIED_ENGINES'
          : 'environment:ALLOWED_ENGINES',
      ],
    };
  }

  const credentialEnvironment = optionalEngineCredentialEnvironment[engine];
  if (!credentialEnvironment) {
    return {
      id: engine,
      name: engines[engine].name,
      kind: 'zero-key',
      status: 'present',
      required: false,
      provenance: ['built-in:zero-key'],
    };
  }

  const credential = environment[credentialEnvironment];
  const status: DoctorStatus = credential === undefined || credential === ''
    ? 'missing'
    : credential.trim() === ''
      ? 'invalid'
      : 'present';
  return {
    id: engine,
    name: engines[engine].name,
    kind: 'optional-api',
    status,
    required: false,
    provenance: [`environment:${credentialEnvironment}`],
  };
}

function inspectEnginePolicy(
  environment: Readonly<Record<string, string | undefined>>,
): Pick<DoctorCheck, 'status' | 'provenance'> {
  const configuredNames = ['ALLOWED_ENGINES', 'DENIED_ENGINES']
    .filter(environmentName => environment[environmentName] !== undefined);
  const provenance = configuredNames.length > 0
    ? configuredNames.map(environmentName => `environment:${environmentName}`)
    : ['built-in:all-engines'];
  const selections = configuredNames.flatMap(environmentName =>
    (environment[environmentName] ?? '').split(',').map(value => value.trim()));
  const valid = selections.every(
    selection => selection !== '' && ALL_ENGINE_ID_SET.has(selection),
  );
  return {
    status: valid ? 'present' : 'invalid',
    provenance,
  };
}

function inspectSemanticFlags(
  environment: Readonly<Record<string, string | undefined>>,
): Pick<DoctorCheck, 'status' | 'provenance'> {
  const configuredFlags = SEMANTIC_FLAGS.filter(
    environmentName => environment[environmentName] !== undefined,
  );
  return {
    status: configuredFlags.every(environmentName =>
      ['true', 'false'].includes(environment[environmentName] ?? ''))
      ? 'present'
      : 'invalid',
    provenance: configuredFlags.length > 0
      ? configuredFlags.map(environmentName => `environment:${environmentName}`)
      : ['built-in:semantic-disabled'],
  };
}

function inspectSemanticDependency(
  enabled: boolean,
  provenance: string[],
  probe: () => boolean,
): DoctorReport['optional_dependencies'][number] {
  let status: DoctorStatus = 'missing';
  if (enabled) {
    try {
      status = probe() ? 'present' : 'missing';
    } catch {
      status = 'missing';
    }
  }
  return {
    id: 'semantic-bridge',
    status,
    required: enabled,
    enabled,
    requirement: 'python3 with model2vec and numpy',
    provenance,
  };
}

function probeSemanticBridge(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const result = spawnSync(
    'python3',
    ['-c', 'import model2vec, numpy'],
    {
      env: {
        ...environment,
        PYTHONDONTWRITEBYTECODE: '1',
      },
      stdio: 'ignore',
      timeout: 3_000,
      windowsHide: true,
    },
  );
  return result.status === 0;
}

function inspectNodeVersion(version: string): DoctorStatus {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return version ? 'invalid' : 'missing';
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 18 || (major === 18 && minor >= 17)
    ? 'present'
    : 'invalid';
}

function summarizeStatus(report: DoctorReport): DoctorStatus {
  const checks: DoctorCheck[] = [
    report.runtime.node,
    report.runtime.platform,
    ...report.providers,
    ...report.optional_dependencies,
    ...report.configuration,
  ];
  if (checks.some(check => check.status === 'invalid')) return 'invalid';
  if (checks.some(check => check.required && check.status === 'missing')) {
    return 'missing';
  }
  return 'present';
}
