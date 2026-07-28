import { describe, expect, it, vi } from 'vitest';

import {
  createDoctorReport,
  formatDoctorReport,
} from '../../src/infrastructure/doctor.js';

describe('search configuration doctor', () => {
  it('reports a zero-key Windows startup as ready on Node 18.17', () => {
    const semanticProbe = vi.fn(() => false);
    const report = createDoctorReport({
      environment: {},
      nodeVersion: '18.17.0',
      platform: 'win32',
      semanticProbe,
    });

    expect(report).toMatchObject({
      schema_version: 'doctor-report-v1',
      scope: 'local-configuration',
      status: 'present',
      runtime: {
        node: {
          status: 'present',
          detected: '18.17.0',
          requirement: '>=18.17.0',
        },
        platform: {
          status: 'present',
          detected: 'win32',
        },
      },
    });
    expect(report.providers
      .filter(provider => provider.kind === 'zero-key')
      .every(provider => provider.status === 'present')).toBe(true);
    expect(report.providers
      .filter(provider => provider.kind === 'optional-api')
      .every(provider => provider.status === 'missing')).toBe(true);
    expect(report.optional_dependencies).toEqual([
      expect.objectContaining({
        id: 'semantic-bridge',
        status: 'missing',
        required: false,
      }),
    ]);
    expect(semanticProbe).not.toHaveBeenCalled();
  });

  it('marks an unsupported Node 18 minor version invalid', () => {
    const report = createDoctorReport({
      environment: {},
      nodeVersion: '18.16.1',
      platform: 'linux',
    });

    expect(report.status).toBe('invalid');
    expect(report.runtime.node.status).toBe('invalid');
  });

  it('reports credential and proxy readiness without exposing values', () => {
    const environment = {
      BRAVE_API_KEY: 'brave-secret-value',
      TAVILY_API_KEY: '   ',
      DUCKDUCKGO_PROXY_URL:
        'http://proxy-user:proxy-secret@proxy.example:8080',
      BAIDU_PROXY_URL: 'http://baidu-proxy.example:8080',
    };
    const report = createDoctorReport({
      environment,
      nodeVersion: '22.0.0',
      platform: 'win32',
    });
    const serialized = JSON.stringify(report);
    const rendered = formatDoctorReport(report);

    expect(report.providers.find(provider => provider.id === 'brave'))
      .toMatchObject({
        status: 'present',
        provenance: ['environment:BRAVE_API_KEY'],
      });
    expect(report.providers.find(provider => provider.id === 'tavily'))
      .toMatchObject({
        status: 'invalid',
        provenance: ['environment:TAVILY_API_KEY'],
      });
    expect(report.configuration.find(check => check.id === 'duckduckgo-proxy'))
      .toMatchObject({
        status: 'present',
        provenance: ['environment:DUCKDUCKGO_PROXY_URL'],
      });
    expect(report.configuration.find(check => check.id === 'baidu-proxy'))
      .toMatchObject({
        status: 'present',
        provenance: ['environment:BAIDU_PROXY_URL'],
      });
    for (const secret of [
      'brave-secret-value',
      'proxy-user',
      'proxy-secret',
      'proxy.example',
    ]) {
      expect(serialized).not.toContain(secret);
      expect(rendered).not.toContain(secret);
    }
  });

  it('flags invalid engine selectors and proxy URLs', () => {
    const report = createDoctorReport({
      environment: {
        ALLOWED_ENGINES: 'duckduckgo,not-an-engine',
        SOGOU_PROXY_URL: 'socks5://user:secret@proxy.example:1080',
      },
      nodeVersion: '20.0.0',
      platform: 'linux',
    });

    expect(report.status).toBe('invalid');
    expect(report.configuration.find(check => check.id === 'engine-policy'))
      .toMatchObject({ status: 'invalid' });
    expect(report.configuration.find(check => check.id === 'sogou-proxy'))
      .toMatchObject({
        status: 'invalid',
        provenance: ['environment:SOGOU_PROXY_URL'],
      });
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('flags an invalid shared proxy switch without reading ambient proxies', () => {
    const report = createDoctorReport({
      environment: {
        USE_PROXY: 'yes',
        HTTPS_PROXY: 'http://ambient.example:8080',
      },
      nodeVersion: '20.0.0',
      platform: 'linux',
    });

    expect(report.status).toBe('invalid');
    expect(report.configuration
      .filter(check => check.id.endsWith('-proxy')))
      .toEqual([
        expect.objectContaining({
          id: 'duckduckgo-proxy',
          status: 'invalid',
          provenance: ['environment:USE_PROXY'],
        }),
        expect.objectContaining({
          id: 'sogou-proxy',
          status: 'invalid',
          provenance: ['environment:USE_PROXY'],
        }),
        expect.objectContaining({
          id: 'bing-proxy',
          status: 'invalid',
          provenance: ['environment:USE_PROXY'],
        }),
        expect.objectContaining({
          id: 'baidu-proxy',
          status: 'invalid',
          provenance: ['environment:USE_PROXY'],
        }),
        expect.objectContaining({
          id: 'yandex-proxy',
          status: 'invalid',
          provenance: ['environment:USE_PROXY'],
        }),
      ]);
    expect(JSON.stringify(report)).not.toContain('ambient.example');
  });

  it('requires the semantic bridge only when semantic search is enabled', () => {
    const missing = createDoctorReport({
      environment: { SEMANTIC_RERANK: 'true' },
      nodeVersion: '20.0.0',
      platform: 'linux',
      semanticProbe: () => false,
    });
    const present = createDoctorReport({
      environment: { SEMANTIC_DEDUP: 'true' },
      nodeVersion: '20.0.0',
      platform: 'linux',
      semanticProbe: () => true,
    });

    expect(missing.status).toBe('missing');
    expect(missing.optional_dependencies[0]).toMatchObject({
      status: 'missing',
      required: true,
    });
    expect(present.status).toBe('present');
    expect(present.optional_dependencies[0]).toMatchObject({
      status: 'present',
      required: true,
    });
  });

  it('reports the core missing when policy disables every zero-key provider', () => {
    const report = createDoctorReport({
      environment: {
        DENIED_ENGINES:
          'duckduckgo,sogou,bing,baidu,wikipedia,startpage,yandex,mojeek,wiby',
      },
      nodeVersion: '20.0.0',
      platform: 'linux',
    });

    expect(report.status).toBe('missing');
    expect(report.configuration.find(check => check.id === 'zero-key-search'))
      .toMatchObject({ status: 'missing', required: true });
  });
  it('reports invalid request-budget overrides without exposing values', () => {
    const report = createDoctorReport({
      environment: { SEARCH_BUDGET_MAX_CALLS: '0' },
      semanticProbe: () => true,
    });
    expect(report.configuration.find(check => check.id === 'request-budget'))
      .toMatchObject({
        status: 'invalid',
        provenance: ['environment:SEARCH_BUDGET_MAX_CALLS'],
      });
    expect(JSON.stringify(report)).not.toContain('\"0\"');
  });

  it('reports cooldown persistence provenance without exposing its path', () => {
    const secretPath = 'C:\\private\\runner\\cooldowns.json';
    const report = createDoctorReport({
      environment: { PROVIDER_COOLDOWN_STORE_PATH: secretPath },
      semanticProbe: () => true,
    });
    expect(report.configuration.find(
      check => check.id === 'provider-cooldown-store',
    )).toMatchObject({
      status: 'present',
      required: false,
      provenance: ['environment:PROVIDER_COOLDOWN_STORE_PATH'],
    });
    expect(JSON.stringify(report)).not.toContain(secretPath);
  });

  it('reports exact-cache provenance without exposing its directory', () => {
    const secretDirectory = 'C:\\private\\runner\\search-cache';
    const report = createDoctorReport({
      environment: {
        SEARCH_CACHE_DIRECTORY: secretDirectory,
        SEARCH_CACHE_TTL_MS: '60000',
      },
      semanticProbe: () => true,
    });
    expect(report.configuration.find(check => check.id === 'exact-cache'))
      .toMatchObject({
        status: 'present',
        required: false,
        provenance: [
          'environment:SEARCH_CACHE_DIRECTORY',
          'environment:SEARCH_CACHE_TTL_MS',
        ],
      });
    expect(JSON.stringify(report)).not.toContain(secretDirectory);
  });
});
