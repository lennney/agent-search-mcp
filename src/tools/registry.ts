import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolPolicy } from '../infrastructure/tool-policy.js';
import {
  setupFetchCsdnArticle,
  setupFetchGithubReadme,
  setupFetchJuejinArticle,
} from './fetch-tools.js';
import { registerFreeExtract } from './free-extract.js';
import { registerFreeSearchAdvanced } from './free-search-advanced.js';
import { registerFreeSearchNews } from './free-search-news.js';
import { setupFreeSearchTool } from './free-search.js';
import { registerSearchWithSynthesis } from './search-with-synthesis.js';

interface LocalizedText {
  en: string;
  zh: string;
}

export interface ToolCapability {
  id: string;
  summary: LocalizedText;
  bestFor: LocalizedText;
  register: (server: McpServer) => void;
}

export const toolRegistry = [
  {
    id: 'free_search',
    summary: { en: 'Multi-engine Web Search with bounded fallback', zh: '多引擎网页搜索与有界回退' },
    bestFor: { en: 'Quick facts and general discovery', zh: '快速查事实和通用发现' },
    register: setupFreeSearchTool,
  },
  {
    id: 'free_search_advanced',
    summary: { en: 'Filtered waterfall search and optional enrichment', zh: '过滤、瀑布搜索和可选内容丰富化' },
    bestFor: { en: 'Domain policy and progressive verification', zh: '域名策略和渐进验证' },
    register: registerFreeSearchAdvanced,
  },
  {
    id: 'free_extract',
    summary: { en: 'Extract a URL as clean Markdown', zh: '将网页提取为干净 Markdown' },
    bestFor: { en: 'Reading complete source pages', zh: '读取完整来源页面' },
    register: registerFreeExtract,
  },
  {
    id: 'fetch_github_readme',
    summary: { en: 'Fetch a public GitHub repository README', zh: '获取公开 GitHub 仓库 README' },
    bestFor: { en: 'Project documentation', zh: '项目文档查阅' },
    register: setupFetchGithubReadme,
  },
  {
    id: 'fetch_csdn_article',
    summary: { en: 'Fetch a CSDN article', zh: '获取 CSDN 文章' },
    bestFor: { en: 'Chinese technical articles', zh: '中文技术文章' },
    register: setupFetchCsdnArticle,
  },
  {
    id: 'fetch_juejin_article',
    summary: { en: 'Fetch a Juejin article', zh: '获取掘金文章' },
    bestFor: { en: 'Chinese developer articles', zh: '中文开发者文章' },
    register: setupFetchJuejinArticle,
  },
  {
    id: 'search_with_synthesis',
    summary: { en: 'Search evidence with an LLM synthesis hint', zh: '搜索证据和 LLM 综合提示' },
    bestFor: { en: 'Agent-authored answers from cited evidence', zh: '基于引用证据生成回答' },
    register: registerSearchWithSynthesis,
  },
  {
    id: 'free_search_news',
    summary: { en: 'Recent news search', zh: '近期新闻搜索' },
    bestFor: { en: 'Time-sensitive discovery', zh: '时效性信息发现' },
    register: registerFreeSearchNews,
  },
] as const satisfies readonly ToolCapability[];

export type RegisteredToolName = (typeof toolRegistry)[number]['id'];

export function registerConfiguredTools(
  server: McpServer,
  policy: ToolPolicy,
): void {
  for (const tool of toolRegistry) {
    if (policy.isToolEnabled(tool.id)) tool.register(server);
  }
}
