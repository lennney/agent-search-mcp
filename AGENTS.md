# Agent Search MCP

多引擎统一搜索 MCP Server：12 个搜索适配器（8 个零密钥、4 个可选 API），
提供 stdio/HTTP MCP 接入和 `fasm` CLI。产品重点是
**免费 + 省 Token + 中文原生 + 多源聚合**。

## 权威信息源

- 版本、依赖和脚本：`package.json`
- 引擎注册与路由：`src/tools/free-search.ts`、`src/engines/`
- 当前进度与待办：`HANDOVER.md`
- 主路线图：`docs/superpowers/plans/2026-07-22-iteration-roadmap.md`
- 生态与 `2026-07-28` 计划：
  `docs/plans/2026-07-25-mcp-ecosystem-and-2026-readiness.md`
- 编码规范：`docs/conventions.md`

不要在本文件复制易过期的测试数量、发布状态或长篇实现日志。需要当前事实时，
读取上述来源并运行对应命令。Git 中的 Plan/ADR 是计划与决策的唯一权威来源；
Hermes 仅可作为带 commit/path 的同步投影。

## 当前边界

- 稳定实现使用 Node.js >=18.17、TypeScript ESM 和 MCP SDK v1，支持 stdio/HTTP。
- `2026-07-28` 适配仅位于 `experiments/mcp-2026/`；通过正式一致性验证前，
  不宣称生产兼容。
- Slim Guard 是独立产品和仓库；没有明确任务时，不在本项目中修改它。
- 搜索质量评测保持轻量：两个不同模型家族独立盲评，第三模型仅裁决分歧；
  AI 结果必须标记为 `ai-reviewed` / `ai-judged`，不能冒充人工真值。

## 修改前

1. 阅读本文件、`HANDOVER.md`、`docs/conventions.md`，再按任务读取相关专题文档。
2. 以当前源码和测试为准，不根据旧文档猜测接口或状态。
3. 保留用户未提交的改动；不要回退无关文件。
4. 新增引擎、改变 MCP 工具签名/包名、增加重大依赖或调整架构分层前，先询问。

## 常用命令

```bash
npm run build                 # 编译 TypeScript
npm test                      # 稳定测试
npm run lint                  # 源码 lint
npm run dev                   # stdio
npm run dev:http              # HTTP（端口 3000）
npm run benchmark:verify      # 冻结格式/Token 回归
npm run benchmark:quality:verify
npm run experimental:2026:test
fasm search "query"
fasm extract "https://..."
```

## 目录

- `src/tools/`：MCP 工具
- `src/engines/`：搜索适配器
- `src/aggregation/`：路由、评分、去重、丰富化和格式化
- `src/synthesis/`：结果合成
- `src/infrastructure/`：安全、HTTP、缓存、限速和日志
- `benchmarks/`：可复现基准、质量评测和评审流水线
- `experiments/mcp-2026/`：隔离的 MCP 2026 实验实现

命名、类型、导入和错误处理规则只在 `docs/conventions.md` 维护，避免重复和冲突。

## 不可破坏的契约

- 引擎失败必须降级/fallback；编排层保留 `partialFailures`，不得把真实异常静默
  伪装成“零结果”。
- 保持现有 MCP 工具输入签名和 stdio JSON-RPC 兼容。stdout 只输出协议数据；
  运行日志走 logger/stderr。
- API key 只能从环境变量读取，禁止写入源码、配置、fixture、日志或命令历史。
- HTTP/both 默认要求 `HTTP_AUTH_TOKEN`；无认证必须显式开启。浏览器 Origin 必须
  命中 `ALLOWED_ORIGINS`。
- DDG 是纯 Node 实现，不探测或调用 Python/ddgs。主链依次尝试页面签发的
  Web preload、HTML 和 Lite；Web preload 只接受精确 HTTPS host/path，
  同一查询保持稳定 User-Agent。`cheerio` 固定为 `1.0.0`，代理 transport
  固定使用 Node 18.17+ 兼容的 Undici 6。
- DDG/Sogou 出站代理只读取 `DUCKDUCKGO_PROXY_URL` / `SOGOU_PROXY_URL`
  或显式的 `USE_PROXY=true` + `PROXY_URL`；不要静默读取系统
  `HTTP_PROXY` / `HTTPS_PROXY`。代理凭证不得进入错误、日志或 fixture。
- 取消信号必须传入限速、重试、HTTP 和丰富化；带信号请求不得共享全局 pending
  promise。parallel/waterfall 必须使用同一搜索选项缓存键。
- 正文提取只能改善 snippet，不得增加 `confidence` 或 `source_count`；
  `EVIDENCE_BUDGET_CHARS` 是整个响应共享预算。
- Adapter 名称不等于独立来源；`source_count` 统计 upstream provider family。
  DuckDuckGo/Bing 保守地归为同一 family，同一 provider 的 HTML/Lite 表示不能增信。
  显式选择的同 family adapter 只作为顺序失败/低质后备；合同映射以
  `docs/contracts/provider-families-v1.json` 为准。
- 原始结果数量不能单独触发提前停止。逐条 relevance、平均 confidence 和
  provider-family 覆盖必须分别通过；默认 relevance floor 是待 pooled qrels
  校准的内部启发式。
- 启用 semantic dedup/rerank 时，提前停止只能依据 post-semantic display
  basket；`meta.execution.quality_gate_stage` 必须反映实际判断阶段。
- DDG Lite 只在 HTML HTTP 202 后、同一总 deadline 内机会性尝试一次；它不是
  限流绕过。调用方取消或其他 provider/IP 级限制不得触发重复请求。
- DDG Web 已返回 `bot_challenge` 时不得继续切 HTML/Lite；只有非 challenge
  的表示失败或空结果才进入下一表示。
- Sogou `/antispider/` 和 DDG challenge 是 `bot_challenge`，不是缺 API Key；
  provider 必须立即进入有界冷却，并通过 `partialFailures` 保留原因。
- `free_search_advanced.time_range` 是已弃用的兼容保留字段。传入时必须在
  搜索前返回 `UNSUPPORTED_FILTER`，不得静默忽略或宣传为通用时间过滤。
- 冻结 fixture 只证明格式和指标代码可复现，不代表搜索质量。公开质量数字必须来自
  非空多系统 capture、完整裁决和明确口径；零结果不得被静默删除。
- runner qualification 只证明当前出口可生成多配置、多 family 的非空候选池；
  adapter 配置级通过不能写成 Agent Search 产品质量或竞品胜负。
- 第三方摘要不自动继承 Apache-2.0。提交 capture 前核对再分发许可与署名。

## 完成标准

- 代码变更：添加/更新测试，运行相关测试和 `npm run build`；影响稳定主路径时运行
  `npm test`，影响实验路径时另跑 `npm run experimental:2026:test`。
- 文档变更：只更新受影响的文档。长篇过程、证据和专题限制写入
  `docs/evidence/`、Plan 或 ADR，不再堆进本文件。
- 功能变更：按影响更新 `CHANGELOG.md`、`README.md`、`HANDOVER.md`。
- 文档或 CI 小改不 bump 版本；发布、push、release 和安全设置变更需用户明确授权。
- commit 格式：`type: 简短描述`，类型使用 `feat`、`fix`、`docs`、`chore`、
  `revert`。

## 专题文档

- 搜索基准与 AI 评测：`benchmarks/README.md`、`benchmarks/methodology.md`
- HTTP 部署：`docs/http-deployment.md`
- 搜索评测调研：`docs/research/2026-07-26-search-quality-evaluation.md`
- Agent Search 产品与架构调研：
  `docs/research/2026-07-26-agent-search-product-architecture.md`
- 关键证据：`docs/evidence/`
- 架构决策：`docs/decisions/`

禁止硬编码密钥、删除 fallback、删除测试换取通过、削弱安全门禁、伪造验证结果，
或未经授权发布包/Release。
