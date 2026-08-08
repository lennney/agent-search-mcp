import { describe, expect, it } from 'vitest';

import {
  resolveSearchRequestContext,
} from '../../src/engines/search-request-context.js';

describe('resolveSearchRequestContext', () => {
  it('uses an explicit supported language instead of query detection', () => {
    expect(resolveSearchRequestContext('人工智能', 'en')).toEqual({
      language: 'en',
      region: 'us-en',
      acceptLanguage: 'en-US,en;q=0.9',
    });
    expect(resolveSearchRequestContext('TypeScript narrowing', 'zh')).toEqual({
      language: 'zh',
      region: 'cn-zh',
      acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
    });
  });

  it('maps automatically detected English and Chinese to stable profiles', () => {
    expect(resolveSearchRequestContext('AbortSignal cancel fetch', 'auto').language)
      .toBe('en');
    expect(resolveSearchRequestContext('缓存穿透如何处理', 'auto').language)
      .toBe('zh');
  });

  it('keeps mixed Chinese queries on the Chinese profile', () => {
    expect(resolveSearchRequestContext('TypeScript 如何收窄 unknown').region)
      .toBe('cn-zh');
  });

  it('falls back to English for languages outside the bilingual contract', () => {
    expect(resolveSearchRequestContext('こんにちは世界').language).toBe('en');
    expect(resolveSearchRequestContext('안녕하세요 세계').language).toBe('en');
    expect(resolveSearchRequestContext('12345').language).toBe('en');
  });
});
