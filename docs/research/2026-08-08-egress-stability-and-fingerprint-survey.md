# 网络出口稳定与指纹轮换调研

日期：2026-08-08
范围：竞品（SearXNG / DDGS / Open-WebSearch）如何保证上游出口稳定与规避反爬；
     对照本项目现有实现，给出合同边界内可吸收的优化项。
关联：ADR-20260808-sticky-proxy-pools、AGENTS.md「不可破坏的契约」、
     `docs/research/2026-08-07-competitive-landscape-and-product-gaps.md`。

> 后记（2026-08-08）：项目已通过 `ADR-20260808-egress-fingerprint-flexibility`
> 取消对指纹轮换 / 挑战规避 / 高频重试的禁止，允许有界重试出口与请求身份。
> 本文第 3、4 节中的「合同边界」表述相应降级为工程取舍；A、B 节优化项仍适用，
> C 节各项也从「禁止」变为「需权衡成本/依赖后自行决定」。

## TL;DR

- 竞品在**出口稳定**上的通用做法：代理池 + 健康检查 + 会话粘性 + 指数退避 +
  多端点 fallback。我们的 sticky proxy pool 已覆盖大部分，但有一个**真实缺口**：
  传输层没有 per-proxy 超时，挂死的代理会把整个查询拖到总 deadline，导致
  「只有抛错才轮换」在最常见的故障模式（静默挂起）下不生效。
- 竞品在**指纹轮换**上的核心手段是 curl_cffi 一类的 TLS/JA3/JA4 + HTTP/2
  指纹模仿。这属于本项目合同明确禁止的「指纹轮换 / 挑战规避」，且 Node 生态
  没有一等公民实现，不建议引入。
- 合同内可做的是**指纹一致性**（不是轮换）：统一同一 provider 的 UA、让
  header 组合内部自洽，减少误报，而不是欺骗。

## 1. 我们现状（基线）

- `src/infrastructure/engine-http.ts`：共享传输层。代理解析顺序为
  引擎单代理 > 引擎代理池（`DUCKDUCKGO_PROXY_URLS` / `SOGOU_PROXY_URLS`，
  2–16 个 URL）> `USE_PROXY=true` + `PROXY_URL` > 直连。
- 查询粘性：按 `affinityKey` 做确定性 SHA-256 哈希选起点，同一逻辑查询的
  bootstrap/preload/HTML/Lite 保持同一出口；只有**抛出的传输层失败**才推进到
  下一个出口，并把该出口冷却 60 秒。
- HTTP 403/429/challenge 一律作为 provider 失败返回 adapter，**永不**轮换
  出口（ADR 明确理由：轮换会规避上游控制、让质量 capture 不可比）。
- `src/infrastructure/health.ts`：provider 级熔断（5 次失败开闸、30s→300s
  退避）、bot_challenge 悬挂（1 小时）、half-open 探测带幂等 lease。
- 指纹现状：DDG web/html、Sogou 统一 `Chrome/136` + Windows UA；Bing/Yandex/
  Baidu/Mojeek/Startpage 各自用 `Chrome/120`（Mac/Windows 混用）；
  `fetch-tools.ts` 用截断 UA；DDG web 带 `Sec-Fetch-*`，其余引擎不带。
  Wikipedia 用自报 UA（符合 Wikimedia 政策）。

## 2. 竞品做法

### 2.1 SearXNG（自托管 metasearch，最成熟）

来源：<https://docs.searxng.org/admin/settings/settings_outgoing.html>

- `outgoing.proxies`：按协议配置**一个或多个**代理，多代理时**round-robin 分发**。
- `outgoing.retries`：HTTP 错误重试时，SearXNG 会换**不同的代理和 source ip**。
- `outgoing.source_ips`：多网卡时按源 IP 绑定。
- `outgoing.pool_connections` / `pool_maxsize`：连接池规模；`enable_http2`。
- `using_tor_proxy`：整机走 Tor。
- 超时：`request_timeout` / `max_request_timeout`，且 `extra_proxy_timeout` 专门为
  代理链留额外时间。
- 它自己的 limiter（`server.limiter` + Valkey）是**对来访 bot 限速**，避免 SearXNG
  因为被滥用而被上游当成 bot，不是给上游做指纹轮换。

要点：SearXNG 的「多代理 round-robin + HTTP 错误重试换出口」与我们「查询粘性 +
仅传输失败换出口」取向相反。它的做法在公共实例（匿名、随机浏览器 profile）下
可行，但会破坏会话一致性，且把 HTTP 错误也当轮换信号，正是我们 ADR 拒绝的。

### 2.2 DDGS / duckduckgo_search（Python）

来源：<https://pypi.org/project/duckduckgo-search/8.0.5/>、curl_cffi、issue #304/#272

- 底层用 **curl_cffi**，`impersonate="chrome"`：模仿 Chrome 的 TLS（JA3/JA4）与
  HTTP/2 指纹。这是它的主要「指纹」手段，**静态**指定一种浏览器，不做 UA 轮换。
- 代理：单个代理，或一个 **rotating residential 网关**（如 iproyal 的
  backconnect 地址）。文档明确「用 rotating proxy，否则每次初始化用新代理」——
  即 DDGS 自己不做逐请求轮换，**把轮换委托给代理服务商的网关**。
- 多端点 fallback：`backend=auto` 依次尝试 lite/html/…，遇到 202/403 ratelimit
  就切后端；`allow_redirects=False` 手控跳转。
- 近期版本（v8.0.2）专门修了 202 ratelimit 误判；社区大量「rotating proxy 仍 202」
  的反馈说明**只有 IP 轮换、没有协调好 header/TLS 时，DDG 仍会拦**。

要点：DDGS 把「指纹」压成一个静态浏览器 profile（curl_cffi），把「出口轮换」
外包给住宅代理网关。这正好拆成本文第 3、4 节的两个维度。

### 2.3 Open-WebSearch（Aas-ee，Node/TS，竞品驱动之一）

来源：<https://github.com/Aas-ee/open-webSearch>

- `SEARCH_MODE=request|auto|playwright`：目前只影响 Bing——request 失败后
  **fallback 到 Playwright 真浏览器**（真浏览器指纹 + 浏览器获取的 cookie）。
  被拦的 CSDN/知乎正文抓取也可用浏览器 cookie 重试。
- 代理：显式 `USE_PROXY=true` + `PROXY_URL`，**禁用 axios 环境代理自动探测**
  （与我们一致，不读 ambient proxy）。Clash fake-ip/TUN 用 `FAKE_IP_CIDRS`。
- 没有代理池轮换；难点交给 Playwright 兜底。出站做了 SSRF 加固
  （`trustedStaticHost` 只豁免固定搜索域名）。

要点：Open-WebSearch 的出口策略最朴素（单代理 + 无轮换），它的「指纹」手段是
**直接上真浏览器**。这与本项目「纯 Node、不依赖浏览器」的契约冲突。

### 2.4 通用 IP 轮换 / egress 最佳实践（行业文章）

来源：Empirium IP Rotation Architecture、AlterLab、MrScraper、dev.to 若干

- **Proxy Manager 模式**：池管理 + 健康检查 + 分配引擎 + 监控。旋转策略分
  per-request / sticky session / time-based 三种；**sticky session**（同一逻辑
  会话一个 IP、会话间轮换）就是我们的查询粘性。
- **健康检查**：连通性（TCP 3s）、延迟阈值、**出站 IP 一致性**、黑名单、
  平台级检查；失败 IP 移出活动池，30 分钟周期重测。
- **故障转移**：同代理重试一次 → 标记降级 → 换同区域下一代理 → 换服务商 →
  告警；**总重试不超过 3 次**（过度重试会加速被检测）。
- **连接池陷阱**：keep-alive 会「吃掉」逐请求轮换——同一 TCP 连接复用同一出口
  IP；必须读完 body 或新建 session。rotating 与 sticky 语义不同：rotating 每次
  连接换 IP，sticky 按时长（1/10/30 分钟）保持，但住宅代理不保证全程同 IP。
- **降级顺序**：先确认配置 → 验证真的在轮换 → 才升级住宅/移动代理。住宅代理
  $5–15/GB，数据中心 $0.5–2/IP；单域名成功率 <80% 是池质量信号。
- **权重路由**：按历史成功率加权（429/403 立刻扣 trust + 指数退避 + 按域名
  隔离），不用纯 round-robin。
- **多层一致性**：IP 地理、`Accept-Language`、TLS 指纹、HTTP/2 伪头顺序要自洽；
  跨层不匹配本身就会触发拦截。

## 3. 指纹轮换到底指什么

行业里「指纹轮换」分三层：

1. **TLS / 传输指纹**：ClientHello 的 cipher suites、扩展顺序、ALPN → JA3/JA4、
   Akamai FP。curl_cffi / curl-impersonate 用 C 级 patch 模仿浏览器。Node 原生
   没有一等公民实现（标准 `https`/`undici` 的 TLS 指纹固定且与浏览器不同），
   要用只能引入 curl-impersonate 的 native binding，或上 Playwright 真浏览器。
2. **HTTP 指纹**：UA、header 集合与顺序、HTTP/2 伪头顺序、`Sec-Fetch-*`、
   `Accept-Language`。纯 Node 可以控制 header，但控制不了伪头顺序与
   TLS 指纹之间的「必须同属一个浏览器」约束。
3. **行为指纹**：请求频率、间隔抖动、点击轨迹、`navigator.webdriver` 等，只有
   真浏览器/脚本化浏览器才能提供。

**我们合同禁止的是「轮换 / 规避」**：AGENTS.md 明确「不使用指纹轮换、挑战规避
或高频重试来获取 DDG/Sogou 结果」，ADR 明确「CAPTCHA/challenge/403/429 轮换
出口会规避上游控制、使质量 capture 不可比」。curl_cffi 式 TLS 模仿 + 挑战后换
UA/IP 恰好落在这条线内，且会把搜索质量声明污染成「规避能力」而非「搜索能力」。

## 4. 合同内可吸收的优化项（按价值排序）

### A. 出口稳定（在合同内，建议做）

1. **per-proxy 传输超时（最高价值，当前真实缺口）**
   现在 `fetchForEngine` 对每个出口没有自己的超时，只依赖调用方整体 deadline。
   挂死/黑洞的代理会占满整个查询预算，永远不会触发「传输失败→轮换」。应在
   `ProxyAgent` 上设 `connect.timeoutMs`（探测代理死活）+ 适度的
   `headersTimeout`，让死代理快速失败并轮换到下一健康出口。这与「HTTP 403/429
   不轮换」不冲突——超时属于传输失败。
2. **407 代理认证失败 → 视为传输失败并轮换**
   带错误/缺失凭据的代理会返回 407，现在被当成普通 Response 交回 adapter 而不
   轮换。这属于配置级故障，应当跳过该出口。
3. **被动健康分 + 可选主动预检**
   给每个出口记录成功/失败率与平均延迟，排序时健康出口优先（现在只按 60s 冷却
   排除）。可选加一个不发真实搜索的预检（对廉价端点做一次带超时的请求），
   运行时默认不做，仅诊断/doctor 场景可选。
4. **传输冷却指数退避 + jitter**
   固定 60s 可改成指数退避（如 60s → 2min → 5min，上限）加少量抖动，避免冷热
   交替。
5. **出站 IP / per-exit 遥测（可选）**
   对每个出口记录出站 IP 与成功率，验证轮换是否真的发生、池质量是否 <80%。
   注意不得把代理凭据写入日志；DDG/Sogou 出口若没有廉价 IP-echo 端点，可仅做
   延迟与状态码统计。

### B. 指纹一致性（在合同内，做「一致」不做「轮换」）

6. **统一同一 provider 的 UA**
   DDG/Sogou 已统一 Chrome/136 Windows；把 Bing/Yandex/Baidu/Mojeek/Startpage
   从 Chrome/120 Mac/Windows 混用收敛到与 DDG 一致的 Chrome/136 Windows（或
   各自固定一个）。跨 provider 不必相同，但每个 provider 内部要自洽。
7. **header 组合自洽**
   DDG web 发 `Sec-Fetch-*`，其他引擎不发；同为 Chrome profile 却缺 `Sec-Fetch-*`
   或 `Referer` 是常见的误报源。给走浏览器 header 的引擎补齐自洽的
   `Sec-Fetch-*` / `Referer`，让「Chrome UA + 浏览器 header 集合」保持一致。
   `fetch-tools.ts` 的截断 UA（无版本号）应补全。**注意分寸**：这是把请求从
   「明显非浏览器」修到「一致」，不是欺骗；不新增随机轮换。
8. **连接池语义确认**
   ProxyAgent 按 cacheKey 缓存、keep-alive 复用，这对粘性是对的；但要确保响应
   body 被完整消费后才释放连接，否则连接被占用、轮换观察失真。

### C. 不建议引入（超出合同 / 成本不划算）

- curl_cffi / curl-impersonate 式 TLS+HTTP/2 指纹模仿（native 依赖 + 属于指纹
  规避空间）。
- Playwright / 真浏览器 fallback（与「纯 Node、零依赖」定位冲突，且属于行为
  指纹规避）。
- 挑战后自动换出口 / 换 UA（明文禁止，且破坏 capture 可比性）。
- 整机 Tor（延迟与可用性代价大，且同样破坏可比性）。

## 5. 对竞品 capture 的影响

- Open-WebSearch 竞品驱动使用 Playwright fallback（Bing）——这会给它「本库没有」
  的规避能力。正式 capture 的 `SEARCH_MODE` 需固定为 `request`，否则三系统
  能力面不可比。这属于竞品驱动配置审计范围，不在本仓库改动。
- 我们的正式 capture 仍按 ADR：竞品驱动**不注入任何 proxy 变量**，单一固定出口；
  本仓库的 sticky pool / 超时优化不影响 capture 可比性（capture 走直连）。
- 若要提升自身出口稳定性用于质量 capture，优先做 A1（per-proxy 超时）与 A3
  （健康分），它们不改变「查询粘性、挑战不轮换」的可比性语义。

## 6. 后续

- A1（per-attempt 超时）、A2（407 视为传输失败）、A3（challenge/403/429 后有界
  换出口）、A4（指数退避 + jitter）已在 `src/infrastructure/engine-http.ts`
  实现；A6（HTTP 层自洽浏览器 profile 集，按查询确定性轮换、查询内稳定）在
  `src/engines/request-profiles.ts` 实现并接入 DDG web/html、Sogou，以及
  bing/yandex/mojeek/startpage（profileHeaders）与 baidu（自洽 UA + client
  hints）。均为纯 Node、零新依赖，离线测试通过。
- 轮换预算按 fetch 计：DDG web 两次 fetch 单查询最多 2 次出口轮换；challenge 在
  有界轮换后仍返回 provider 并悬挂（1 小时冷却），`partialFailures` 语义不变。
- native TLS 模仿：独立调研见 `docs/research/2026-08-08-tls-impersonation-survey.md`。
  结论为**不采用**——Node 端选项全为 alpha/preview、Windows 仅 `curl-cffi-node`
  有现成预编译、`impers` 首启运行时下载 native、全部打破零依赖定位，且 DDG/Sogou
  的边际收益未验证。若将来上，藏在 `engine-http.ts` 传输缝后 + 干净出口 A/B 实测，
  并按 AGENTS.md 先询问依赖。
