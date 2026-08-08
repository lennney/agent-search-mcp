# Node TLS 指纹模仿调研（ddgs 同款）

日期：2026-08-08
范围：`ADR-20260808-egress-fingerprint-flexibility` 之后挂起的「native TLS 模仿」
     独立决策。项目已实现 HTTP 层自洽 profile（`src/engines/request-profiles.ts`），
     本调研回答：要不要、能不能、怎么加 curl-impersonate 一类的 TLS 层模仿。
关联：`docs/research/2026-08-08-egress-stability-and-fingerprint-survey.md`（第 3 节
     指纹分层）。

## TL;DR

- **不采用（现状）**。Node 生态 2026 年已有 4+ 个 TLS 模仿库，但全是 alpha/
  technical-preview 级别；Windows 只有 `curl-cffi-node` 有现成预编译；`impers`
  首次启动会**运行时下载 native 二进制**（供应链风险）；全部打破本项目「纯 Node、
  零依赖」定位，且对 DDG/Sogou 的边际收益未验证。
- **条件性路径**：若将来做，正确接法是把 curl-impersonate 类客户端藏在
  `engine-http.ts` 传输缝后面、仅 DDG/Sogou 出口可选启用，并在干净出口上做 A/B
  实测，证明 TLS 模仿确实提升成功率后，再提交依赖决策。

## 1. 它解决什么、我们缺什么

TLS 层模仿（JA3/JA4、cipher 顺序、TLS 扩展、ALPN、HTTP/2 SETTINGS/WINDOW_UPDATE/
伪头顺序，部分还含 HTTP/3/QUIC 与 TCP/IP 指纹）是在「HTTP header 之上」的一层：
curl_cffi/curl-impersonate 让握手本身看起来像真浏览器。我们已做的 HTTP 层 profile
只改 header，**TLS ClientHello 仍是 Node/OpenSSL 默认**（`request-profiles.ts` 头注释
已明确此边界）。SearXNG 维护者分析 DDG 可能做 TLS 指纹检测，但 DDG 的 202 主因是
IP 信誉 + 频率；curl_cffi 有效不代表 Node 端必须同步——我们已用出口轮换 + 有界
重试 + HTTP 层 profile 覆盖了更主要的杠杆。

## 2. Node 选项（2026-08 现状）

| 库 | 绑定 | 成熟度 | Windows | 供应链 / 备注 |
|---|---|---|---|---|
| `impers`（lexiforest） | Koffi FFI → curl-impersonate，官方 Node 绑定 | **alpha / technical preview** | 「支持主要平台」，但**首次启动运行时下载** curl-impersonate v2.0.0 | 运行期下载 = 离线不可用 + 供应链面；可 `IMPERS_LIBCURL_RELEASE_URL` 覆盖 |
| `curl-cffi-node`（meodemsao） | napi-rs → curl-impersonate | 较新、有预编译 | **win32-x64-gnu 预编译存在**；源码构建需 Rust 1.70+ / VS Build Tools | 无 runtime 依赖，~5MB native 经 optionalDependencies |
| `node-curl-impersonate`（M00N7682） | N-API addon → libcurl-impersonate | 较新 | **无 Windows 预编译** → Windows 需 node-gyp 源码编译 | 50+ presets，Node>=18 |
| `wreq-js`（0x676e67） | Rust（BoringSSL fork） | rc 级（wreq v6.0.0-rc） | 宣称支持 Windows | 原生目标含 Windows |
| `ghostfetch` | Go uTLS 引擎 + Node（Named Pipe/IPC） | 较新 | Windows arm64 受限；`isolated-vm` 在 Windows 可能失败 | 带 Cloudflare/Akamai/DataDome JS challenge 自动求解（更强规避） |
| `httpcloak` | Go + Node 绑定 | 很新 | 未知 | 全栈指纹含 TCP/IP |
| `CycleTLS` | Node + Go 子进程（utls） | 半维护 | 有 | preset 漂移，HTTP/2 保真弱 |

活跃维护的事实标准是 **lexiforest/curl-impersonate**（v1.5.6，2026-05-02，原
lwthiker 仓库 2024 起已停更）；`curl_cffi`（Python）v0.15.1b1。对比见
<https://krowdev.com/article/tls-impersonation-library-comparison/>。

## 3. 供应链与维护风险（本项目的视角）

- **运行期下载**（impers）与本项目「测试不联网、离线可复现」的契约冲突，且一个
  发布包在用户首启时拉二进制是明显的供应链暴露。
- **native 二进制**（curl-cffi-node 等）经 optionalDependencies 分发 ~5MB 产物；
  对已发布的 npm 包，供应链审计面从纯 JS 扩展到 Rust/C 工具链 + curl 补丁。
- **arms race**：浏览器每 6 周升级，JA3/HTTP2 指纹被跟踪后需持续重烤（impers 每次
  Chrome 大版本都要跟进）；这是「能力」而非一次性的「修复」。
- 成熟度：除 `curl_cffi`（Python）外，Node 端全是 alpha/preview 或 rc，API 随时变。

## 4. 收益判断（对 DDG/Sogou）

- DDG 202：主因 IP 信誉 + 频率（见主调研引用的 apiserpent、SearXNG issue #4824）；
  数据中心/共享代理 IP 反而更易 202。TLS 模仿只在 DDG 确实做 JA3 检测时才有增量，
  我们当前出口没有该证据。
- Sogou antispider：403 主因 IP/UA 启发式；HTTP 层 profile 已覆盖 UA 维度。
- 已有替代杠杆已落地：出口轮换（有界）、per-attempt 超时、指数退避、HTTP 层自洽
  profile。TLS 模仿是「最后一层」，但成熟度/供应链成本远高于其不确定的边际收益。

## 5. 决策与条件路径

**决策：不采用，保持 HTTP 层 + 出口可靠性。**

如果未来要上，正确姿势（避免污染主路径）：
1. 把 curl-impersonate 类客户端藏在 `engine-http.ts` 的传输缝后，作为
   `fetchForEngine` 的一个可选 dispatcher，仅 DDG/Sogou 出口、且由显式 env 开关启用；
  不影响直连、其他引擎、MCP 契约。
2. 在干净出口上先做小样本 A/B：同一查询集，Node 默认 TLS vs 一种模仿 target，
   对比 202/空结果率。用数据决定是否值得为它引入依赖。
3. 依赖决策按 AGENTS.md「新增重大依赖前先询问」走，优先候选 `curl-cffi-node`
   （Windows 预编译存在、无 runtime 下载、无运行时依赖），回避 `impers` 的
   首启下载。Node 端先不发布为默认依赖。

## 来源

- impers: <https://github.com/lexiforest/impers>
- curl-cffi-node: <https://github.com/meodemsao/curl-cffi-node>
- node-curl-impersonate: <https://github.com/M00N7682/node-curl-impersonate>
- ghostfetch: <https://www.npmjs.com/package/ghostfetch>
- wreq / wreq-js: <https://github.com/0x676e67/wreq>
- curl-impersonate（活跃 fork）: <https://github.com/lexiforest/curl-impersonate>
- 对比综述: <https://krowdev.com/article/tls-impersonation-library-comparison/>
