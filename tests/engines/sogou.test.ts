import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseSogouHtml, searchSogou } from '../../src/engines/sogou.js';

const SEARCH_HTML = `
  <main id="main">
    <div class="vrwrap">
      <h3 class="pt">
        <a href="/link?url=opaque" data-url="https://example.cn/article">
          搜狗 <em>结果</em>
        </a>
      </h3>
      <div class="ft">中文 <strong>摘要</strong></div>
      <cite>example.cn</cite>
    </div>
    <div class="vrwrap special-wrap">
      <h3 class="pt"><a href="https://ads.example/">广告</a></h3>
    </div>
  </main>
`;

describe('Sogou engine', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses current result cards and prefers their external data URL', () => {
    expect(parseSogouHtml(SEARCH_HTML)).toEqual([{
      title: '搜狗 结果',
      url: 'https://example.cn/article',
      snippet: '中文 摘要',
      source: 'example.cn',
      engines: ['sogou'],
    }]);
  });

  it('stops at an antispider redirect and exposes a structured challenge', async () => {
    global.fetch = vi.fn(async () => new Response('', {
      status: 302,
      headers: {
        location: 'http://www.sogou.com/antispider/?from=%2Fweb',
        'set-cookie': 'SUID=secret; Path=/; HttpOnly',
      },
    })) as typeof fetch;

    await expect(searchSogou('测试', 10, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'bot_challenge',
      retryable: false,
      cooldownMs: 3_600_000,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps cookies across an allowed non-challenge redirect', async () => {
    const calls: RequestInit[] = [];
    global.fetch = vi.fn(async (_input, init) => {
      calls.push(init ?? {});
      if (calls.length === 1) {
        return new Response('', {
          status: 302,
          headers: {
            location: 'https://www.sogou.com/web?query=test&page=1',
            'set-cookie': 'SUID=session-value; Path=/; HttpOnly',
          },
        });
      }
      return new Response(SEARCH_HTML, { status: 200 });
    }) as typeof fetch;

    await expect(searchSogou('测试', 10, {
      throwOnError: true,
    })).resolves.toHaveLength(1);
    expect(new Headers(calls[1].headers).get('cookie')).toBe(
      'SUID=session-value',
    );
  });

  it('rejects an HTTP downgrade outside the known challenge path', async () => {
    global.fetch = vi.fn(async () => new Response('', {
      status: 302,
      headers: {
        location: 'http://www.sogou.com/web?query=test&page=1',
      },
    })) as typeof fetch;

    await expect(searchSogou('测试', 10, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'upstream_4xx',
      retryable: false,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not trust an external redirect that resembles a challenge path', async () => {
    global.fetch = vi.fn(async () => new Response('', {
      status: 302,
      headers: {
        location: 'https://example.com/antispider/',
      },
    })) as typeof fetch;

    await expect(searchSogou('测试', 10, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'upstream_4xx',
      retryable: false,
    });
  });

  it('classifies a direct 403 as a zero-key upstream challenge', async () => {
    global.fetch = vi.fn(async () => new Response('', {
      status: 403,
    })) as typeof fetch;

    await expect(searchSogou('测试', 10, {
      throwOnError: true,
    })).rejects.toMatchObject({
      failureType: 'bot_challenge',
      retryable: false,
    });
  });
});
