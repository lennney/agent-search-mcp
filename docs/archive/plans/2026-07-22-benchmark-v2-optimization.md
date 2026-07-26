# Benchmark 评测机制 v2 优化方案

> 对比 Glama TDQS、MCPMark、SimpleQA、FreshQA 后的改进计划。
> 核心目标：从"子串匹配"升级到"LLM-as-a-Judge + pass@k + 通用测试框架"。

---

## 当前 v1 的缺点

| 问题 | v1 做法 | 为什么不够 |
|------|---------|-----------|
| 🎯 评分方式 | `expected` 子串匹配 | 太脆弱。"capital of France" 如果返回 "French capital Paris" 匹配不上 |
| 📊 问题量 | 34-60 题 | SimpleQA 有 4,326 题。60 题统计意义不够 |
| 🔧 测试框架 | 硬编码到 agent-search-mcp | 不能通用测 Brave/Exa/Tavily/Firecrawl |
| 📈 pass 指标 | 单次尝试 | MCPMark 用 pass@1/pass@4/pass^4，单次不能衡量稳定性 |
| 📝 TDQS | 无 | Glama 有专门研究（97% 工具有缺陷），我们没覆盖这个维度 |
| ⏱ 时效检测 | 字符串匹配 | 无法从 URL/snippet 真正提取日期 |
| 🇨🇳 中文评分 | 只查域名 | 域名匹配太粗糙，应该看内容质量 |
| 📉 延迟 | p50/p95 | 看不出分布形态 |
| 🔄 重复性 | 人工打分 | Glama 做了 100 万次自动化扫描 |

---

## 参考对象的做法

### Glama TDQS (Tool Definition Quality Score)

```
6 维度 × 1-5 分:
  1. Purpose Clarity     (25%) — 工具描述是否说清楚干什么
  2. Usage Guidelines    (20%) — 说了什么时候该/不该用
  3. Behavioral Transp.  (20%) — 说明了副作用/幂等性
  4. Parameter Semantics (15%) — 参数名、类型、约束是否明确
  5. Conciseness         (10%) — 是否简洁
  6. Contextual Complete (10%) — LLM 能否仅凭描述正确调用

Server 总分 = 60% × mean(TDQS) + 40% × min(TDQS)
               ↑平均分          ↑最低分（一把拖垮）
```

**优点**: 自动化、开源、可复现
**缺点**: 只测工具描述，不测实际功能质量

### MCPMark

```
127 任务 × 5 MCP 服务器
指标: pass@1 / pass@4 / pass^4
环境: Docker 隔离 + agent harness
验证: 自动化 verifier
```

**优点**: pass@k 指标科学、隔离环境
**缺点**: 不测搜索质量，只测 tool-use

### SimpleQA

```
4,326 事实问题
评分: LLM-as-a-Judge (CORRECT/INCORRECT/NOT_ATTEMPTED)
标准: 单一确定答案、不随时间变化
```

**优点**: LLM 评分比子串匹配灵活 100 倍、大规模问题集
**缺点**: 需要 LLM API 调用（有成本）

---

## v2 优化方案

### 🔄 优化 1: LLM-as-a-Judge 取代子串匹配

```
v1: expected: "Paris" → snippet.includes("Paris")
    ❌ "French capital" 不匹配
    ❌ "París" 不匹配
    ❌ "the capital city of France is..." 没有含 "Paris" 但答案正确

v2: LLM 评分器
    提问: "下面搜索结果是否回答了问题 'capital of France'？"
    结果: ["Paris is the capital of France", ...]
    输出: CORRECT / INCORRECT / NOT_ATTEMPTED
    ✅ "French capital since 508 AD" → CORRECT
    ✅ "Ile-de-France region" → INCORRECT (不够具体)
```

**成本**: 每次评分 ~100 tokens，4,326 题约 $0.10（用 flash 模型）。对我们 200 题约 $0.005。

### 📊 优化 2: 问题集扩展到 200+，使用结构化 YAML

```yaml
# questions/factual.yaml
version: 2.0
category: factual
questions:
  - id: FAC-001
    query: "capital of France"
    expected: "Paris"
    difficulty: easy
    tags: ["geography", "general-knowledge"]
    
  - id: FAC-042
    query: "Python programming language creator"
    expected: "Guido van Rossum"
    difficulty: medium
    tags: ["programming", "history"]
    
  - id: FAC-101  
    query: "What is the thermodynamic boiling point of pure water at sea level in degrees Celsius?"
    expected: "100°C"
    difficulty: easy
    tags: ["science", "chemistry"]
```

| 品类 | 题数 | 来源 |
|:----:|:----:|------|
| 事实 (Factual) | 100 | 参考 SimpleQA 设计原则 |
| 时效 (Temporal) | 50 | 参考 FreshQA，季度更新 |
| 中文 (Chinese) | 30 | 新增，LLM 评分 |
| 多源 (Multi-source) | 20 | 跨引擎一致性 |
| **合计** | **200** | |

### 📈 优化 3: pass@k 指标

```
MCPMark 的 pass^4 要求 4 次都过，这是真正的稳定性信号

我们实现:
  pass@1  = 一次尝试成功
  pass@4  = 4 次尝试至少 1 次成功  
  pass^4  = 4 次尝试全部成功（可靠性指标）
  
  avg@4   = 4 次平均分
```

### 🔧 优化 4: 通用 MCP 测试框架

```
v1: spawn 'node dist/index.js'（硬编码）
v2: 支持任意 MCP 服务器
  
  # 测试 stdio 服务器
  bench run --cmd "npx @modelcontextprotocol/server-brave-search" --env BRAVE_API_KEY=xxx
  
  # 测试 HTTP 远程服务器  
  bench run --url "https://mcp.exa.ai/mcp" --api-key xxx
  
  # 自动检测: 列出工具 → 找到搜索工具 → 运行问答
  bench auto-detect --cmd "npx agent-search-mcp"
```

检测流程：
1. `tools/list` → 获取所有工具列表
2. 按命名规则推断搜索工具（`*search*`, `*query*`, ...）
3. 按参数签名匹配（`query: string`）
4. 运行问答题集

### 📝 优化 5: 集成 TDQS

```
新增 "definition_quality" 评测:
  用 Glama 的 TDQS 方法自动评分：
  - Purpose Clarity (1-5)
  - Usage Guidelines (1-5)
  - Behavioral Transparency (1-5)
  - Parameter Semantics (1-5)
  - Conciseness (1-5)
  - Contextual Completeness (1-5)

  Server 分 = 60% × mean + 40% × min
  
  → 不需要 LLM，纯规则扫描 tool schema
```

工具：`@glama-ai/tdqs`（他们已经开源了）

### ⏱ 优化 6: 时效检测从关键词升级到日期解析

```
v1: 看 snippet 里有没有 "latest" "2026" 等关键词
v2: 
  1. 从 URL pattern 提取日期 (/2026/07/22/article-name)
  2. 从 snippet 提取时间表达 ("yesterday", "July 2026")
  3. LLM 评分: "结果是否来自最近 7 天？"
  4. 综合 = 30% URL + 30% snippet + 40% LLM
```

### 📉 优化 7: 延迟分布直方图

```
v1: p50, p95
v2: 
  延迟分布:
    <100ms:   ████████░░ 42%
    100-500ms: ██████░░░░ 31%
    500-1s:    ████░░░░░░ 18%
    1-3s:      ██░░░░░░░░ 8%
    3-10s:     ░░░░░░░░░░ 1%
    >10s:      ░░░░░░░░░░ 0%
```

### 🇨🇳 优化 8: 中文搜索用 LLM 评分

```
v1: 只看域名 (结果是否来自 csdn.net)
v2: LLM 评分器:
    "以下中文搜索结果对查询 '{query}' 有多相关？"
    1 (无关) → 5 (非常相关)
    
    额外维度: 
    - 结果权威性 (baike/zhihu/csdn 加分)
    - 结果新鲜度 
    - 内容质量 (有无实质信息)
```

---

## v2 技术架构

```
scripts/search-bench/v2/
├── index.ts              # 入口 CLI
├── runner.ts             # 通用 MCP 测试运行器
├── harness/
│   ├── stdio.ts          # stdio 模式连接
│   └── http.ts           # HTTP remote 模式连接
├── questions/
│   ├── factual-100.yaml  # 事实问题 (100)
│   ├── temporal-50.yaml  # 时效问题 (50)
│   ├── chinese-30.yaml   # 中文问题 (30)
│   └── multi-source.yaml # 多源问题 (20)
├── judges/
│   ├── llm-judge.ts      # LLM-as-a-Judge (CORRECT/INCORRECT/NOT_ATTEMPTED)
│   ├── tdqs.ts           # Tool Definition Quality Score
│   └── freshness.ts      # 时效性检测
├── metrics/
│   ├── passk.ts          # pass@1, pass@4, pass^4
│   └── latency.ts        # 延迟分布
└── reporters/
    ├── json.ts           # JSON 输出 → 网站数据
    ├── markdown.ts       # MD 报告 → 评测文章
    └── html.ts           # HTML 可视化
```

## 输出格式

```json
{
  "server": {
    "name": "agent-search-mcp",
    "version": "3.1.2",
    "transport": "stdio"
  },
  "benchmark": {
    "version": 2.0,
    "timestamp": "2026-07-22T12:00:00Z",
    "questions": 200,
    "runs": 4
  },
  "scores": {
    "overall": 74,
    "dimensions": {
      "search_accuracy": { "pass@1": 68, "pass@4": 82, "pass^4": 55 },
      "freshness": { "pass@1": 37, "pass@4": 52, "pass^4": 28 },
      "chinese": { "pass@1": 70, "pass@4": 84, "pass^4": 62 }
    },
    "tdqs": {
      "purpose_clarity": 4,
      "usage_guidelines": 5,
      "behavioral_transparency": 4,
      "parameter_semantics": 4,
      "conciseness": 3,
      "contextual_completeness": 4,
      "overall": 4.1
    }
  },
  "latency": {
    "p50_ms": 502,
    "p95_ms": 747,
    "histogram": { "<100ms": 42, "100-500ms": 31, "500-1000ms": 18, "1-3s": 8, "3-10s": 1, ">10s": 0 }
  }
}
```

## 执行顺序

| 优先级 | 优化项 | 工作量 | 影响 |
|:------:|--------|:------:|:----:|
| P0 | 通用 MCP 测试框架 | 3 天 | 能测 Brave/Exa 等 |
| P0 | LLM-as-a-Judge | 1 天 | 评分质量飞跃 |
| P1 | pass@k 指标 | 1 天 | 稳定性可量化 |
| P1 | 200 题问题集 | 2 天 | 统计意义 |
| P2 | 延迟直方图 | 0.5 天 | 可视化 |
| P2 | 时效日期解析 | 1 天 | 更准的时效评分 |
| P3 | TDQS 集成 | 1 天 | 新维度 |
| P3 | 中文 LLM 评分 | 0.5 天 | 更准的中文分 |
