import { describe, expect, it } from 'vitest';
import {
  classifyQuery,
  QUERY_CLASSIFIER_VERSION,
} from '../../src/aggregation/query-classifier.js';

describe('query classifier', () => {
  it.each([
    ['official MCP API documentation', 'docs', 'en', 'evergreen'],
    ['MCP 官方文档和接口规范', 'docs', 'zh', 'evergreen'],
    ['latest AI security news today', 'news', 'en', 'current'],
    ['今天人工智能安全新闻', 'news', 'zh', 'current'],
    ['github repository source code', 'code', 'en', 'evergreen'],
    ['这个项目的源码仓库', 'code', 'zh', 'evergreen'],
    ['how does photosynthesis work', 'general', 'en', 'evergreen'],
    ['咖啡为什么会提神', 'general', 'zh', 'evergreen'],
  ] as const)(
    'classifies %s',
    (query, intent, language, freshness) => {
      expect(classifyQuery(query)).toMatchObject({
        classifier_version: QUERY_CLASSIFIER_VERSION,
        intent,
        language,
        freshness,
      });
    },
  );

  it('normalizes equivalent Unicode and whitespace deterministically', () => {
    expect(classifyQuery('  ＧｉｔＨｕｂ repository  ')).toEqual(
      classifyQuery('github repository'),
    );
  });

  it('uses explicit news evidence over tied code evidence', () => {
    expect(classifyQuery('GitHub repository release news')).toMatchObject({
      intent: 'news',
      freshness: 'current',
    });
  });

  it('returns stable, sorted and deduplicated signal codes', () => {
    const result = classifyQuery('latest docs documentation manual');
    expect(result.signals).toEqual([...new Set(result.signals)].sort());
    expect(result.signals).not.toContain('latest');
  });
});
