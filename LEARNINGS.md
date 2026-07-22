---
type: Learnings
title: agent-search-mcp LEARNINGS
timestamp: '2026-07-20T23:35:20+08:00'
description: 技术教训和踩坑记录
tags:
- agent-search-mcp
- learnings
---
# LEARNINGS.md — Agent Search MCP

> Agent 每次任务后自动追加，不需要手动维护

## 踩坑记录

## 2026-07-22: DDG HTML 引擎限流 (HTTP 202)
- **问题**: html.duckduckgo.com POST 请求频繁时返回 HTTP 202 (rate-limited)，搜索返回空
- **原因**: DDG 对无 JS 签名的请求有严格限流，普通 HTTP 库无法绕过
- **解决**: rotating User-Agent (4 个) + HTTP 202 检测 + 空数组降级。Python ddgs 路径不受此限制（使用内部 API）
- **规则**: DDG HTML 路径仅作为回退，主力仍是 Python ddgs

## 2026-07-22: cheerio 相比 regex 的解析可靠性
- **问题**: DDG HTML 结构复杂（redirect URL、嵌套 div、协议相对地址），regex 无法可靠解析
- **解决**: cheerio（DOM 解析器）替代 regex，支持 CSS 选择器遍历嵌套结构
- **规则**: 复杂 HTML 解析用 cheerio（或同类 DOM 库），不用 regex

## 2026-07-22: ToolPolicy allow/deny 顺序
- **问题**: ToolPolicy 初始化时如果某个工具既在 allow 又在 deny 中，行为不明确
- **解决**: deny 优先（allowlist 只负责"不在列表中的禁用"，但 deny 直接踢出）
- **规则**: 所有 allow/deny 策略中，deny 永远高于 allow

## 2026-07-16: Baidu 引擎只有标题没有摘要
- **问题**: Baidu 搜索结果 snippet 字段始终为空，中文搜索结果质量受损
- **原因**: HTML 解析只匹配了 h3 > a 提取标题和 URL，未解析 c-abstract 摘要区域
- **解决**: 重构为 block-based 解析——getResultBlocks() 先按 h3 拆分，然后逐 block 用三级 fallback 提取摘要：(1) .c-abstract div/span (2) .content-right_* class (3) 20-200 字符的 span 兜底
- **规则**: 每次加引擎必须验证 title + url + snippet 三个字段都有值

## 2026-07-16: AbortSignal.timeout 兼容性问题
- **问题**: `AbortSignal.timeout(10000)` 在 Node.js < 18.14 不存在
- **原因**: 这个静态方法是 2022 年底才加的，旧版本会抛 TypeError
- **解决**: 用 `AbortController + setTimeout` 包装成 `createTimeoutSignal(ms)` 函数
- **规则**: 新 API 先查 Node.js 兼容性表，不确定就用 polyfill 模式

## 2026-07-03: CLI 二进制命名冲突
- **问题**: CLI 二进制从 asm → fas → fasm 改了三次
- **原因**: asm 与汇编语言关联冲突；fas 太通用
- **解决**: 最终定名 fasm (Free Agent Search MCP)
- **规则**: CLI 命名先在 npm 搜索是否已被占用

## 2026-06-27: DDG 反爬导致搜索失败
- **问题**: 直接 HTTP 请求 DuckDuckGo 返回空结果或验证页面
- **原因**: DDG 检测到非浏览器 User-Agent 触发反爬
- **解决**: 切换到 Python `ddgs` 库作为后端（子进程调用），绕过反爬检测
- **规则**: 免费搜索引擎优先用官方库/API，直接 HTTP 抓取作为最后手段

## 2026-06-22: stdout 污染 JSON-RPC
- **问题**: console.log 输出混入 MCP JSON-RPC 流，导致客户端解析失败
- **原因**: MCP 协议通过 stdout 传输 JSON-RPC，任何其他 stdout 输出都会破坏协议
- **解决**: 所有日志切换到 pino 写 stderr；CLI 模式单独处理
- **规则**: MCP stdio 模式下永远不写 stdout（除 JSON-RPC 框架输出外）

## 架构发现

### 瀑布搜索的置信度篮子设计
- 3 阶段搜索（DDG+Sogou → Bing+Baidu → Brave+Tavily+Exa）
- 每阶段后检查 Top-5 结果的平均置信度
- 达标（≥0.6）则停止后续阶段，节省 50-75% 引擎调用
- 关键权衡：搜索结果数量 vs 质量。篮子大小（topK=5）经过调优

### 多引擎权重设计
- 不是简单计数（3 个引擎返回 > 2 个引擎返回）
- 而是加权和：Brave(0.95) + Exa(0.92) 的置信度高于 Sogou(0.80) + Baidu(0.75)
- 权重反映引擎的索引质量和结果精准度

### 中文搜索双引擎策略
- Sogou: 对微信生态、中文论坛覆盖好
- Baidu: 对百度百科、贴吧、知道覆盖好
- 两者互补，单一引擎的中文覆盖率有限

### 请求合并模式
- 相同查询在 100ms 内的并发请求自动合并（in-flight dedup）
- 避免 LLM agent 的并行工具调用产生重复搜索
- 实现: Map<collapseKey, Promise<SearchResponse>>
