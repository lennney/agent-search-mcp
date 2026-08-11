import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('current public documentation', () => {
  const currentDocs = [
    read('../README.md'),
    read('../README_zh.md'),
    read('../benchmarks/README.md'),
    read('../docs/index.md'),
  ];

  it('uses the current deterministic fixture values', () => {
    for (const document of currentDocs) {
      expect(document).toContain('2396.0');
      expect(document).toContain('1650.1');
      expect(document).toContain('1633.0');
      expect(document).toContain('31.1%');
      expect(document).toContain('31.8%');
    }
  });

  it('keeps the current docs on the public search boundary', () => {
    expect(read('../README.md')).toContain('English and Chinese web search');
    expect(read('../README_zh.md')).toContain('中英文网页搜索');
    expect(read('../README.md')).not.toContain('context-compression');
    expect(read('../README_zh.md')).not.toContain('上下文压缩');
  });
});
