# 分发渠道状态追踪 — Agent Search MCP

> 最后更新: 2026-07-27
> npm: v3.1.3 (latest) / v3.2.0-beta.0 (beta) | GitHub Stars: 20 | 月下载: 1,840

---

## 数据总览

| 指标 | 数值 |
|------|------|
| npm 最新版 | v3.1.3 |
| npm beta 版 | v3.2.0-beta.0 ✅ 刚发 |
| npm 月下载 | 1,840 |
| npm 周下载 | 900 |
| npm 日下载 | 62 |
| GitHub Stars | 20 ⭐ |
| GitHub Topics | 20 |
| npm keywords | 31 |

---

## 渠道状态

### ✅ 已上线

| 渠道 | 链接 / ID | 备注 |
|------|----------|------|
| **npm** | `agent-search-mcp` | latest v3.1.3 / beta v3.2.0-beta.0 |
| **GitHub** | `lennney/agent-search-mcp` | 20 topics, badges, CI, Releases |
| **Glama** | [glama.ai/mcp/servers/lennney/agent-search-mcp](https://glama.ai/mcp/servers/lennney/agent-search-mcp) | ✅ **已 Claim**，维护/质量/许可全 A |
| **Official MCP Registry** | `io.github.lennney/agent-search-mcp` | v3.1.3 已发布，状态 active |
| **mcp.so** | [mcp.so/servers/agent-search-dc1371](https://mcp.so/servers/agent-search-dc1371) | 已上线（slug 非标准） |
| **awesome-mcp-servers (punkpeye)** | [PR #10383](https://github.com/punkpeye/awesome-mcp-servers/pull/10383) | ✅ **已合并** (2026-07-22) |
| **PulseMCP** | pulsemcp.com | 搜索结果有返回，待确认索引 |

### ⏳ 待确认 / 待收录

| 渠道 | 状态 | 备注 |
|------|------|------|
| **mcp.directory** | ❌ 404 | 之前说已提交但未收录，仍未索引 |
| **mcpservers.org** | ❌ 404 | 同上 |
| **mcprepository.com** | ❌ 404 | 自动发现未生效 |
| **mcpmarket.com** | 403 | 可能需要登录或自动发现未完成 |

### ❌ 未提交

| 渠道 | 操作 | 耗时 |
|------|------|------|
| **LobeHub** | 需 `lhm login` + `lhm github connect` 后提交 | 5min |
| **Smithery** | 有 API key 即可 curl 提交 | 5min |
| **FastMCP** | 打开 https://fastmcp.com/submit | 2min |
| **awesome-remote-mcp-servers** | GitHub PR 加一行 | 5min |
| **Rodert/awesome-mcp** | [PR #19](https://github.com/Rodert/awesome-mcp/pull/19) | ⏳ OPEN，待合并 |
| **patriksimek/awesome-mcp-servers-2** | PR 到 README（之前 PR #21 是 mcp-slim-guard，非本项目） | 5min |

### 📝 内容营销待发布

| 平台 | 文件 | 状态 |
|------|------|:----:|
| **掘金** (ZH) | `docs/geo/juejin-agent-search-mcp.md` | 📝 草稿就绪 |
| **dev.to** (EN) | 未写 | ❌ |
| **V2EX** (ZH) | 未写 | ❌ |
| **Reddit r/mcp** (EN) | 未写 | ❌ |
| **MCP Discord #showcase** | 未写 | ❌ |

### 🚫 跳过

| 渠道 | 原因 |
|------|------|
| Docker Hub | 本机无 Docker，需 Mac 操作 |

---

## 行动清单 (按优先级)

```
P0 ─── FastMCP 提交（2min）
    ├── 等 Rodert PR #19 合并
    └── 关掉旧 dist 记录（v3.1.3 → 标记 beta 存在）

P1 ─── 发掘金文章（草稿已就绪）
    ├── 写 dev.to / V2EX 草稿
    ├── LobeHub 登录后提交
    └── Smithery 提交（curl）

P2 ─── Docker Hub 推送（Mac）
    ├── awesome-remote-mcp-servers PR
    ├── MCP Discord 发帖
    └── patriksimek/awesome-mcp-servers-2 PR
```

---

## 版本发布历史

| 版本 | 日期 | 渠道 | 备注 |
|------|------|------|------|
| v3.1.3 | 已发布 | npm (latest) | 当前 stable |
| v3.2.0-beta.0 | 2026-07-27 | npm (beta) | P2 语义层，服务器测试中 |
