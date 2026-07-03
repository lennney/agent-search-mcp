# Agent Search MCP — 多引擎统一搜索 MCP Server

一句话：7 引擎搜索（ddg/sogou/bing/baidu/brave/tavily/exa），MCP 协议接入

## 常用命令

```bash
npm run build                              # 编译 TypeScript
npm test                                   # 跑测试（vitest）
npm run dev                                # 本地运行（stdio 模式）
npm run dev:http                           # HTTP 模式（端口 3000）
npm run dev:both                           # stdio + HTTP 同时
npm run lint                               # 检查（如有）
```

## 技术栈

TypeScript / Node.js / @modelcontextprotocol/sdk / zod / pino / vitest

## 架构

```
MCP Client → Server(stdio/http) → EngineRouter
                                    ├── DuckDuckGo
                                    ├── Sogou
                                    ├── Bing
                                    ├── Baidu
                                    ├── Brave (需 API key)
                                    ├── Tavily (需 API key)
                                    └── Exa (需 API key)
```

- 免费引擎（ddg/sogou/bing/baidu）无需 API key
- 付费引擎自动 fallback：key 不存在就跳过
- 搜索质量 > 缓存命中率（缓存非优先）

## 约束

1. 引擎失败自动 fallback，不中断
2. 搜索质量第一，引擎覆盖第二
3. npm publish 前切 official registry（registry.npmjs.org）
4. 包名: `free-agent-search-mcp`

## 边界

- ✅ Always: 跑测试、更新 CHANGELOG、build 通过
- ⚠️ Ask: 加新引擎、改 MCP 协议接口、改包名
- 🚫 Never: 硬编码 API key、删引擎 fallback 逻辑、改 stdio 协议

## 依赖关系

- 上游：baby-harness 可能调搜索结果做任务上下文
- 下游：任何 MCP 客户端（Hermes / Claude Code）

## Agent 规则

- 每次完成任务后，更新 HANDOVER.md
- 踩到新坑时，运行: `bash ~/.hermes/scripts/auto-learn.sh . "<问题>" 踩坑`
- commit message 格式: `type: 简短描述`
- 详细工作流参考: `~/agent-workspace-refarch/workflows/`
