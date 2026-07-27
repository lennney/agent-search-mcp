import { detectLanguage } from './language-detector.js';

export const QUERY_CLASSIFIER_VERSION = 'query-classifier-v1';

export type QueryIntent = 'docs' | 'news' | 'code' | 'general';
export type QueryFreshness = 'current' | 'evergreen';

export interface QueryClassification {
  classifier_version: typeof QUERY_CLASSIFIER_VERSION;
  intent: QueryIntent;
  language: 'en' | 'zh';
  freshness: QueryFreshness;
  confidence: number;
  signals: string[];
}

interface IntentRule {
  signal: string;
  pattern: RegExp;
  weight: number;
}

const INTENT_RULES: Record<Exclude<QueryIntent, 'general'>, IntentRule[]> = {
  docs: [
    { signal: 'docs:documentation', pattern: /\b(?:docs?|documentation|manual)\b/u, weight: 3 },
    { signal: 'docs:reference', pattern: /\b(?:api reference|reference guide|specification|rfc)\b/u, weight: 3 },
    { signal: 'docs:zh', pattern: /(?:官方文档|开发文档|接口文档|使用手册|参考手册|规范)/u, weight: 3 },
  ],
  news: [
    { signal: 'news:news', pattern: /\b(?:news|breaking news|headlines?)\b/u, weight: 3 },
    { signal: 'news:release', pattern: /\b(?:announcement|announced|release notes?|changelog)\b/u, weight: 2 },
    { signal: 'news:zh', pattern: /(?:新闻|快讯|头条|最新动态|发布公告|更新日志)/u, weight: 3 },
  ],
  code: [
    { signal: 'code:repository', pattern: /\b(?:github|gitlab|repository|repo|source code)\b/u, weight: 3 },
    { signal: 'code:artifact', pattern: /\b(?:npm|pypi|crate|package|sdk|library)\b/u, weight: 2 },
    { signal: 'code:implementation', pattern: /\b(?:implementation|code example|stack trace|bug fix)\b/u, weight: 2 },
    { signal: 'code:zh', pattern: /(?:源代码|源码|代码仓库|项目仓库|代码示例|报错堆栈|实现方式)/u, weight: 3 },
  ],
};

const CURRENT_RULES: IntentRule[] = [
  { signal: 'freshness:latest', pattern: /\b(?:latest|newest|current|today|this week|recent)\b/u, weight: 1 },
  { signal: 'freshness:version', pattern: /\b(?:release|released|version|changelog)\b/u, weight: 1 },
  { signal: 'freshness:zh', pattern: /(?:最新|今天|今日|本周|近期|当前版本|刚发布)/u, weight: 1 },
  { signal: 'freshness:year', pattern: /\b20\d{2}\b/u, weight: 1 },
];

const INTENT_PRIORITY: QueryIntent[] = ['news', 'code', 'docs', 'general'];

export function classifyQuery(query: string): QueryClassification {
  const normalized = query.normalize('NFKC').trim().toLowerCase();
  const language = detectLanguage(normalized) === 'zh' ? 'zh' : 'en';
  const scores: Record<QueryIntent, number> = {
    docs: 0,
    news: 0,
    code: 0,
    general: 0,
  };
  const signals: string[] = [];

  for (const [intent, rules] of Object.entries(INTENT_RULES) as Array<
    [Exclude<QueryIntent, 'general'>, IntentRule[]]
  >) {
    for (const rule of rules) {
      if (!rule.pattern.test(normalized)) continue;
      scores[intent] += rule.weight;
      signals.push(rule.signal);
    }
  }

  const intent = INTENT_PRIORITY.reduce((winner, candidate) =>
    scores[candidate] > scores[winner] ? candidate : winner,
  'general');
  const freshnessSignals = CURRENT_RULES
    .filter(rule => rule.pattern.test(normalized))
    .map(rule => rule.signal);
  const freshness = freshnessSignals.length > 0 ? 'current' : 'evergreen';
  signals.push(...freshnessSignals);

  const competingScore = Math.max(
    0,
    ...Object.entries(scores)
      .filter(([candidate]) => candidate !== intent)
      .map(([, score]) => score),
  );
  const winningScore = scores[intent];
  const confidence = winningScore === 0
    ? 0.5
    : Math.min(0.98, 0.65 + Math.max(0, winningScore - competingScore) * 0.08);

  return {
    classifier_version: QUERY_CLASSIFIER_VERSION,
    intent,
    language,
    freshness,
    confidence: Number(confidence.toFixed(2)),
    signals: [...new Set(signals)].sort(),
  };
}
