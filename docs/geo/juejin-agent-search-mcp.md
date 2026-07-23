# Tavily 太贵？我搭了一个 11 引擎的免费 MCP 搜索服务器，开源了

> AI Agent 每天搜上百次技术文档，Tavily 月费 $100+ 吃不消？花 15 分钟搭一个自己的搜索服务器，**11 个引擎聚合、8 个完全免费、零 API Key**。刚开源，求 Star 🙏

---

## 一、先算一笔账

如果你在用 AI Agent（Claude Code、Cursor、Cline 等）做开发，大概率绕不开搜索。查 API 文档、搜技术方案、验证新闻事实——Agent 每天都在搜。

一开始我用 Tavily，质量确实不错。但用了两个月看账单：

| 方案 | 免费额度 | 月费(1000次/天) |
|------|---------|----------------|
| Tavily | 1000/月 | ~$240/月 |
| Exa | $10 额度 | $50/月起 |
| Brave Search | 2000/月 | ~$84/月 |
| Serper | 2500/月 | ~$9/月 |
| **agent-search-mcp** | **无限** | **$0** |

**每年轻轻松松省下几千美元。** 而且 agent-search-mcp 不单是便宜的替代品——它把 11 个引擎的结果做了多源交叉验证，比单引擎更可靠。

---

## 二、市场方案全景对比

| 方案 | 免费额度 | 引擎数 | 内容提取 | 自托管 | Token 优化 | API Key |
|------|---------|:------:|:--------:|:------:|:----------:|:-------:|
| Tavily | 1000/月 | 单源 | ✅ | ❌ | ❌ | 必填 |
| Exa | $10/月 | 单源 | ✅ | ❌ | ❌ | 必填 |
| Brave | 2000/月 | 单源 | ❌ | ❌ | ❌ | 必填 |
| Serper | 2500/月 | 单源 | ❌ | ❌ | ❌ | 必填 |
| DDG MCP | 无限 | 单源 | ❌ | ✅ | ❌ | 非必须 |
| **agent-search-mcp** | **无限** | **11 引擎** | **✅** | **✅** | **✅** | **非必须** |

唯一一个在「免费」「多引擎」「自托管」「Token 优化」「内容提取」五个维度同时满足的方案。

---

## 三、凭什么免费？8 个免费引擎

核心思路很简单：**聚合已有的免费搜索接口，不做昂贵的中间层。**

```
你的 Agent → agent-search-mcp → 11 个引擎并发搜索
                    ↓
             去重 + 评分 + 排序
                    ↓
              返回最优结果
```

### 8 个免费引擎（零 API Key）

| 引擎 | 用途 |
|------|------|
| DuckDuckGo | 通用搜索，隐私优先 |
| Bing | 微软必应，英文技术内容 |
| Sogou | 搜狗搜索——中文技术博客/文档 |
| Baidu | 百度搜索——国内信息 |
| Wikipedia | 百科知识 |
| Startpage | Google 结果，匿名代理 |
| Yandex | 俄语/东欧内容 |
| Mojeek | 独立爬虫，不跟踪 |

### 3 个付费引擎（可选增强）

Brave / Tavily / Exa —— 填写 API Key 后自动作为 fallback 增强层。

**实际使用中，8 个免费引擎已经覆盖了 95% 的需求。**

---

## 四、多源交叉验证——Agent 不会被骗

单引擎搜索的最大问题是：**你不知道结果靠不靠谱。**

agent-search-mcp 把同一个查询同时发到多个引擎，跨源对比：

- 每个结果附带**置信度评分**（1-3 分）
- ≥2 分 = 至少被两个不同引擎独立验证过
- 跨语言去重（中英文结果自动融合）

比如说搜 "React 19 新特性"，DuckDuckGo 和 Bing 和 Sogou 各返回一堆链接。agent-search-mcp 会：
1. URL 去重 → 去掉重复的
2. 标题相似去重 → 去掉换源转载的
3. 频次评分 → 同时出现在多个引擎的排前面
4. 域名权威加分 → GitHub/官方文档权重更高

---

## 五、5 分钟跑起来

```bash
# 直接 npx 跑（零安装）
npx -y agent-search-mcp

# 或者全局安装
npm install -g agent-search-mcp
```

然后在 Claude Desktop / Cursor / Cline 的配置里加：

```json
{
  "mcpServers": {
    "agent-search": {
      "command": "npx",
      "args": ["-y", "agent-search-mcp"]
    }
  }
}
```

重启 Agent，你的 AI 就有 11 个搜索引擎了。

**中文搜索直接搜，不用任何配置** —— agent-search-mcp 自动检测语言，中文查询自动启用 Sogou + Baidu。

---

## 六、进阶功能

| 功能 | 说明 |
|------|------|
| **瀑布搜索** | 先搜免费引擎，结果不够自动切换到付费引擎 |
| **内容丰富化** | 对低置信度结果自动提取页面全文 |
| **新闻搜索** | 专用新闻搜索模式（DDG News + Bing News） |
| **Token 优化** | 自动裁剪冗余内容，节省 ~40-50% token |
| **安全防护** | SSRF 保护 + 注入检测 + 速率限制 |
| **Docker 部署** | 一键 `docker pull`，生产环境友好 |

---

## 七、总结

**agent-search-mcp 是给 AI Agent 用的免费多引擎搜索服务器。** 不需要 API Key，不需要付费，15 分钟搭好就能用。

- ⭐ GitHub：[lennney/agent-search-mcp](https://github.com/lennney/agent-search-mcp)（点个 Star 支持一下 🙏）
- 📦 npm：[agent-search-mcp](https://www.npmjs.com/package/agent-search-mcp)
- 📖 英文版：[Read in English](https://gh.l-web.com/blog/tavily-alternative-agent-search-mcp-en)
- 438 个测试，MIT 协议
