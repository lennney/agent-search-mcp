import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeenableProvider } from '../../src/engines/keenable.js';

const fetchMock = vi.fn<typeof fetch>();
const provider = new KeenableProvider();

beforeEach(() => {
  vi.stubEnv('KEENABLE_API_KEY', 'test-key');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('KeenableProvider', () => {
  it('does not fetch without a credential', async () => {
    vi.stubEnv('KEENABLE_API_KEY', '');
    await expect(provider.search('test', 10)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps safe entries and falls back to description', async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [
      null,
      { title: 'Unsafe', url: 'data:text/plain,test' },
      { title: 'Missing URL' },
      { title: ' T1 ', url: 'https://example.com/1', snippet: ' Content 1 ' },
      { title: 'T2', url: 'https://example.com/2', description: 'Content 2' },
    ] }));
    await expect(provider.search('test', 5)).resolves.toEqual([
      { title: 'T1', url: 'https://example.com/1', snippet: 'Content 1', source: 'keenable', engines: ['keenable'] },
      { title: 'T2', url: 'https://example.com/2', snippet: 'Content 2', source: 'keenable', engines: ['keenable'] },
    ]);
  });

  it.each([[0, 1], [7, 7], [100, 50]])('bounds count %i to %i and preserves request options', async (count, bounded) => {
    fetchMock.mockResolvedValue(Response.json({ results: [] }));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await provider.search('hello', count);
    expect(fetchMock).toHaveBeenCalledWith('https://api.keenable.ai/v1/search', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({ query: 'hello', max_results: bounded }),
      signal: expect.any(AbortSignal),
    }));
    expect(timeout).toHaveBeenCalledWith(5000);
  });

  it.each([
    [401, 'permission_denied', false], [403, 'permission_denied', false],
    [400, 'upstream_4xx', false], [500, 'upstream_5xx', true],
    [503, 'upstream_5xx', true], [501, 'upstream_5xx', false],
  ])('classifies HTTP %i', async (status, failureType, retryable) => {
    fetchMock.mockResolvedValue(new Response('', { status }));
    await expect(provider.search('test', 5)).rejects.toMatchObject({ failureType, retryable });
  });

  it('preserves Retry-After without an immediate retry', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '42' } }));
    await expect(provider.search('test', 5)).rejects.toMatchObject({
      failureType: 'rate_limited', retryable: false, cooldownMs: 42_000,
    });
  });

  it.each([null, [], {}, { results: {} }, { results: 'bad' }])('rejects an invalid response shape: %j', async body => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(provider.search('test', 5)).rejects.toMatchObject({ failureType: 'parse_error', retryable: false });
  });

  it('distinguishes malformed JSON from a valid empty response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{')).mockResolvedValueOnce(Response.json({ results: [] }));
    await expect(provider.search('test', 5)).rejects.toMatchObject({ failureType: 'parse_error', retryable: false });
    await expect(provider.search('test', 5)).resolves.toEqual([]);
  });

  it('preserves the caller cancellation reason', async () => {
    const controller = new AbortController();
    const reason = new Error('User cancelled');
    fetchMock.mockImplementation(async (_url, init) => {
      controller.abort(reason);
      expect(init?.signal?.reason).toBe(reason);
      throw reason;
    });
    await expect(provider.search('test', 5, { signal: controller.signal })).rejects.toBe(reason);
  });

  it('classifies a provider timeout as retryable', async () => {
    fetchMock.mockRejectedValue(new DOMException('operation timed out', 'TimeoutError'));
    await expect(provider.search('test', 5)).rejects.toMatchObject({ failureType: 'timeout', retryable: true });
  });
});
