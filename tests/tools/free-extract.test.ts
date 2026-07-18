import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Mock infrastructure
vi.mock('../../src/infrastructure/url-validator.js', () => ({
  validateUrl: vi.fn(),
}));

let registerFreeExtract: typeof import('../../src/tools/free-extract.js').registerFreeExtract;
let mockValidateUrl: import('../../src/infrastructure/url-validator.js').validateUrl;

describe('free_extract tool', () => {
  beforeAll(async () => {
    const mod = await import('../../src/tools/free-extract.js');
    registerFreeExtract = mod.registerFreeExtract;
    const uv = await import('../../src/infrastructure/url-validator.js');
    mockValidateUrl = uv.validateUrl;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (mockValidateUrl as any).mockReturnValue({ valid: true });
    global.fetch = vi.fn();
  });

  function makeServer() {
    const server = { tool: vi.fn() } as any;
    registerFreeExtract(server);
    const handler = server.tool.mock.calls[0][3] as Function;
    return { server, handler };
  }

  it('registers a tool named free_extract', () => {
    const { server } = makeServer();
    expect(server.tool).toHaveBeenCalledOnce();
    expect(server.tool.mock.calls[0][0]).toBe('free_extract');
  });

  it('extracts content from a valid URL', async () => {
    const { handler } = makeServer();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => '# Hello\n\nThis is markdown content.',
    });
    const result = await handler({ url: 'https://example.com/article' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Hello');
  });

  it('truncates content to max_length', async () => {
    const { handler } = makeServer();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => 'A'.repeat(100),
    });
    const result = await handler({ url: 'https://example.com/long', max_length: 20 });
    expect(result.content[0].text.length).toBe(20);
  });

  it('rejects URLs that fail SSRF validation', async () => {
    const { handler } = makeServer();
    (mockValidateUrl as any).mockReturnValue({ valid: false, error: 'Blocked: internal IP' });
    const result = await handler({ url: 'http://169.254.169.254/' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Blocked');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns error on fetch failure', async () => {
    const { handler } = makeServer();
    (global.fetch as any).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await handler({ url: 'https://example.com/down' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  it('returns error on HTTP error status', async () => {
    const { handler } = makeServer();
    (global.fetch as any).mockResolvedValue({ ok: false, status: 403 });
    const result = await handler({ url: 'https://example.com/forbidden' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('403');
  });
});
