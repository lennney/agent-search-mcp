# Tool Allow/Denylist — 工具可见性控制

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过 `ENABLED_TOOLS` / `DISABLED_TOOLS` 环境变量控制哪些 MCP 工具对 Agent 可见，无需修改代码即可裁剪工具集。

**Architecture:** 在 `Config` 中新增两个字段，在 `index.ts` 中注册工具前检查策略。延续现有 `EnginePolicy` 模式（allow/deny + deny 优先）。不改变工具注册函数的签名。

**Tech Stack:** TypeScript strict, Node.js >=18, vitest, @modelcontextprotocol/sdk

## Global Constraints

- TypeScript strict mode — no `any`, all function params/returns typed
- ESM modules — `.js` extensions in imports
- 不改变现有工具接口签名（向后兼容）
- 所有工具默认启用（空配置 = 全部可见）
- `DISABLED_TOOLS` 优先级高于 `ENABLED_TOOLS`
- 文件命名：snake_case

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/infrastructure/config.ts` | Add `enabledTools` + `disabledTools` + `isToolEnabled()` |
| Create | `src/infrastructure/tool-policy.ts` | Add `ToolPolicy` class (mirrors `EnginePolicy` pattern) |
| Modify | `src/index.ts` | Conditionally register tools based on `ToolPolicy` |
| Create | `tests/infrastructure/tool-policy.test.ts` | Add `ToolPolicy` tests (extend existing file) |
| Modify | `tests/infrastructure/config.test.ts` | Add `enabledTools`/`disabledTools` parsing tests |
| Modify | `README.md` | Document new env vars |
| Modify | `README-zh.md` | Same, Chinese |
| Modify | `AGENTS.md` | Update known traps |
| Modify | `CHANGELOG.md` | Add [Unreleased] entry |

---

### Task 1: Config — Add enabledTools + disabledTools

**Files:**
- Modify: `src/infrastructure/config.ts`
- Test: `tests/infrastructure/config.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `Config.enabledTools: string[]`, `Config.disabledTools: string[]`, `Config.ENABLED_TOOLS: string`, `Config.DISABLED_TOOLS: string`

- [ ] **Step 1: Write the failing test**

Add to `tests/infrastructure/config.test.ts` (after the last test):

```typescript
  it('parses ENABLED_TOOLS as array', () => {
    process.env.ENABLED_TOOLS = 'free_search,free_extract';
    const config = loadConfig();
    expect(config.enabledTools).toEqual(['free_search', 'free_extract']);
  });

  it('parses ENABLED_TOOLS with spaces', () => {
    process.env.ENABLED_TOOLS = ' free_search , free_extract ';
    const config = loadConfig();
    expect(config.enabledTools).toEqual(['free_search', 'free_extract']);
  });

  it('defaults enabledTools to empty array', () => {
    delete process.env.ENABLED_TOOLS;
    const config = loadConfig();
    expect(config.enabledTools).toEqual([]);
  });

  it('parses DISABLED_TOOLS as array', () => {
    process.env.DISABLED_TOOLS = 'free_extract,fetch_github_readme';
    const config = loadConfig();
    expect(config.disabledTools).toEqual(['free_extract', 'fetch_github_readme']);
  });

  it('defaults disabledTools to empty array', () => {
    delete process.env.DISABLED_TOOLS;
    const config = loadConfig();
    expect(config.disabledTools).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/infrastructure/config.test.ts`
Expected: FAIL — `enabledTools` / `disabledTools` not in Config type

- [ ] **Step 3: Write minimal implementation**

In `src/infrastructure/config.ts`, add to the `Config` interface:

```typescript
export interface Config {
  mode: 'stdio' | 'http' | 'both';
  port: number;
  enableCors: boolean;
  corsOrigin: string;
  useProxy: boolean;
  proxyUrl: string;
  defaultEngine: string;
  allowedEngines: string[];
  ALLOWED_ENGINES: string;
  DENIED_ENGINES: string;
  ENABLED_TOOLS: string;
  DISABLED_TOOLS: string;
  enabledTools: string[];
  disabledTools: string[];
}
```

In `loadConfig()`, add to the return object:

```typescript
return {
  mode,
  port,
  enableCors: process.env.ENABLE_CORS === 'true',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  useProxy: process.env.USE_PROXY === 'true',
  proxyUrl: process.env.PROXY_URL || 'http://127.0.0.1:7890',
  defaultEngine: process.env.DEFAULT_ENGINE || 'duckduckgo',
  allowedEngines: process.env.ALLOWED_ENGINES
    ? process.env.ALLOWED_ENGINES.split(',').map(e => e.trim())
    : [],
  ALLOWED_ENGINES: process.env.ALLOWED_ENGINES || '',
  DENIED_ENGINES: process.env.DENIED_ENGINES || '',
  ENABLED_TOOLS: process.env.ENABLED_TOOLS || '',
  DISABLED_TOOLS: process.env.DISABLED_TOOLS || '',
  enabledTools: process.env.ENABLED_TOOLS
    ? process.env.ENABLED_TOOLS.split(',').map(t => t.trim()).filter(Boolean)
    : [],
  disabledTools: process.env.DISABLED_TOOLS
    ? process.env.DISABLED_TOOLS.split(',').map(t => t.trim()).filter(Boolean)
    : [],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/infrastructure/config.test.ts`
Expected: PASS — all 12 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/config.ts tests/infrastructure/config.test.ts
git commit -m "feat: add ENABLED_TOOLS/DISABLED_TOOLS to config"
```

---

### Task 2: ToolPolicy — Tool visibility check

**Files:**
- Modify: `src/infrastructure/tool-policy.ts` (add `ToolPolicy` class alongside `EnginePolicy`)
- Test: `tests/infrastructure/tool-policy.test.ts` (add ToolPolicy tests)

**Interfaces:**
- Consumes: `Config.enabledTools`, `Config.disabledTools`
- Produces: `ToolPolicy.isToolEnabled(name: string): boolean`

- [ ] **Step 1: Write the failing test**

Add to `tests/infrastructure/tool-policy.test.ts` (after the last `EnginePolicy` test):

```typescript
import { ToolPolicy } from '../../src/infrastructure/tool-policy.js';

describe('ToolPolicy', () => {
  describe('empty/null config', () => {
    it('allows all tools when no params provided', () => {
      const policy = new ToolPolicy();
      expect(policy.isToolEnabled('free_search')).toBe(true);
      expect(policy.isToolEnabled('free_extract')).toBe(true);
      expect(policy.isToolEnabled('search_with_synthesis')).toBe(true);
    });

    it('allows all tools with empty arrays', () => {
      const policy = new ToolPolicy([], []);
      expect(policy.isToolEnabled('free_search')).toBe(true);
      expect(policy.isToolEnabled('free_extract')).toBe(true);
    });
  });

  describe('isToolEnabled', () => {
    it('returns true for an enabled tool', () => {
      const policy = new ToolPolicy(['free_search', 'free_extract']);
      expect(policy.isToolEnabled('free_search')).toBe(true);
      expect(policy.isToolEnabled('free_extract')).toBe(true);
    });

    it('returns false for a non-enabled tool when allowlist is set', () => {
      const policy = new ToolPolicy(['free_search']);
      expect(policy.isToolEnabled('free_extract')).toBe(false);
      expect(policy.isToolEnabled('search_with_synthesis')).toBe(false);
    });

    it('returns false for a denied tool', () => {
      const policy = new ToolPolicy(undefined, ['free_extract', 'free_search_news']);
      expect(policy.isToolEnabled('free_extract')).toBe(false);
      expect(policy.isToolEnabled('free_search_news')).toBe(false);
    });

    it('denied takes priority over allowed', () => {
      const policy = new ToolPolicy(['free_search', 'free_extract', 'free_search_news'], ['free_extract']);
      expect(policy.isToolEnabled('free_extract')).toBe(false);
      expect(policy.isToolEnabled('free_search')).toBe(true);
      expect(policy.isToolEnabled('free_search_news')).toBe(true);
    });

    it('allows tools not in denied list when no allowlist set', () => {
      const policy = new ToolPolicy(undefined, ['free_extract']);
      expect(policy.isToolEnabled('free_extract')).toBe(false);
      expect(policy.isToolEnabled('free_search')).toBe(true);
      expect(policy.isToolEnabled('search_with_synthesis')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('trims whitespace in tool names', () => {
      // Tool names passed to isToolEnabled should be clean;
      // the constructor handles trimming of config values
      const policy = new ToolPolicy([' free_search ', ' free_extract ']);
      expect(policy.isToolEnabled('free_search')).toBe(true);
      expect(policy.isToolEnabled('free_extract')).toBe(true);
    });

    it('returns false for unknown tool when allowlist set', () => {
      const policy = new ToolPolicy(['free_search']);
      expect(policy.isToolEnabled('nonexistent_tool')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/infrastructure/tool-policy.test.ts`
Expected: FAIL — `ToolPolicy` is not exported from tool-policy.ts

- [ ] **Step 3: Write minimal implementation**

Add to `src/infrastructure/tool-policy.ts` (after the existing `EnginePolicy` class):

```typescript
/**
 * Tool visibility policy — controls which MCP tools are registered.
 * Mirrors EnginePolicy pattern: allowlist + denylist, deny wins.
 */
export class ToolPolicy {
  private allowed: Set<string> | null;
  private denied: Set<string>;

  constructor(enabledTools?: string[], disabledTools?: string[]) {
    this.allowed = (enabledTools && enabledTools.length > 0)
      ? new Set(enabledTools.map(t => t.trim()).filter(Boolean))
      : null;
    this.denied = new Set(
      (disabledTools || []).map(t => t.trim()).filter(Boolean)
    );
  }

  /** Check whether a tool should be registered and visible to the agent. */
  isToolEnabled(name: string): boolean {
    if (this.denied.has(name)) return false;
    if (this.allowed && !this.allowed.has(name)) return false;
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/infrastructure/tool-policy.test.ts`
Expected: PASS — all tests pass (existing EnginePolicy tests + new ToolPolicy tests)

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/tool-policy.ts tests/infrastructure/tool-policy.test.ts
git commit -m "feat: add ToolPolicy class for tool visibility control"
```

---

### Task 3: index.ts — Conditional tool registration

**Files:**
- Modify: `src/index.ts`
- Modify: `src/infrastructure/index.ts` (re-export ToolPolicy)

**Interfaces:**
- Consumes: `Config.enabledTools`, `Config.disabledTools`, `ToolPolicy`
- Produces: Tools are conditionally registered on the MCP server

- [ ] **Step 1: Update barrel export**

In `src/infrastructure/index.ts`, add after the existing `EnginePolicy` export:

```typescript
export { ToolPolicy } from './tool-policy.js';
```

- [ ] **Step 2: Modify index.ts**

Replace `src/index.ts` main() function's tool registration section (lines 23-29):

```typescript
  // Register tools (conditionally based on ENABLED_TOOLS / DISABLED_TOOLS)
  const toolPolicy = new ToolPolicy(config.enabledTools, config.disabledTools);

  if (toolPolicy.isToolEnabled('free_search')) setupFreeSearchTool(server);
  if (toolPolicy.isToolEnabled('free_search_advanced')) registerFreeSearchAdvanced(server);
  if (toolPolicy.isToolEnabled('free_extract')) registerFreeExtract(server);
  if (toolPolicy.isToolEnabled('fetch_github_readme')) setupFetchTools(server);
  if (toolPolicy.isToolEnabled('search_with_synthesis')) registerSearchWithSynthesis(server);
  if (toolPolicy.isToolEnabled('free_search_news')) registerFreeSearchNews(server);
```

Also add the `ToolPolicy` import at the top of `index.ts` (after existing infrastructure imports):

```typescript
import { loadConfig, ToolPolicy } from './infrastructure/config.js';
```

Wait — `ToolPolicy` is exported from `tool-policy.ts`, re-exported from `infrastructure/index.ts`. Let me use the barrel:

```typescript
import { loadConfig } from './infrastructure/config.js';
import { ToolPolicy } from './infrastructure/tool-policy.js';
```

Actually, let me keep it consistent with the existing pattern. The file already imports `loadConfig` from `./infrastructure/config.js`. I'll import `ToolPolicy` from `./infrastructure/tool-policy.js` directly.

Updated imports (add to existing imports at top of `src/index.ts`):

```typescript
import { ToolPolicy } from './infrastructure/tool-policy.js';
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests pass (424 tests)

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/infrastructure/index.ts
git commit -m "feat: conditional tool registration via ENABLED_TOOLS/DISABLED_TOOLS"
```

---

### Task 4: Documentation

**Files:**
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- No code interfaces — documentation only

- [ ] **Step 1: Update README.md**

Add a new section after the existing "Environment Variables" or configuration section. Find the right location and add:

```markdown
### Tool Visibility

Control which MCP tools are registered and visible to the agent:

```bash
# Only enable search tools (disable extraction)
ENABLED_TOOLS=free_search,free_search_advanced,free_search_news

# Disable specific tools
DISABLED_TOOLS=free_extract,fetch_github_readme

# Combine: allow search tools, but disable news
ENABLED_TOOLS=free_search,free_search_advanced,free_search_news
DISABLED_TOOLS=free_search_news
```

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLED_TOOLS` | (all) | Comma-separated list of tools to enable. If set, only these tools are registered. |
| `DISABLED_TOOLS` | (none) | Comma-separated list of tools to disable. Takes priority over `ENABLED_TOOLS`. |

Available tool names: `free_search`, `free_search_advanced`, `free_extract`, `fetch_github_readme`, `search_with_synthesis`, `free_search_news`
```

- [ ] **Step 2: Update README-zh.md**

Add equivalent Chinese documentation:

```markdown
### 工具可见性

控制哪些 MCP 工具注册并对 Agent 可见：

```bash
# 只启用搜索工具（禁用提取）
ENABLED_TOOLS=free_search,free_search_advanced,free_search_news

# 禁用特定工具
DISABLED_TOOLS=free_extract,fetch_github_readme
```

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `ENABLED_TOOLS` | (全部) | 逗号分隔的工具列表。设置后只注册这些工具。 |
| `DISABLED_TOOLS` | (无) | 逗号分隔的禁用工具列表。优先级高于 `ENABLED_TOOLS`。 |
```

- [ ] **Step 3: Update AGENTS.md known traps**

Add to the "已知陷阱" section:

```markdown
- **工具可见性**: `ENABLED_TOOLS` / `DISABLED_TOOLS` 环境变量控制 MCP 工具注册。`DISABLED_TOOLS` 优先级高于 `ENABLED_TOOLS`。默认全部启用。资源（capabilities/health）不受此策略影响。
```

- [ ] **Step 4: Update CHANGELOG.md**

Add entry at the top of `[Unreleased]` section:

```markdown
### Added
- `ENABLED_TOOLS` / `DISABLED_TOOLS` env vars — control which MCP tools are visible to the agent
- `ToolPolicy` class — allow/deny pattern for tool registration
```

- [ ] **Step 5: Commit**

```bash
git add README.md README-zh.md AGENTS.md CHANGELOG.md
git commit -m "docs: document ENABLED_TOOLS/DISABLED_TOOLS env vars"
```

---

## Self-Review

1. **Spec coverage**: All 3 HANDOVER/ARCHITECTURE-IMPROVEMENTS items assessed. Pattern 6 (Tool Allow/Denylist) is the only unimplemented one. Patterns 7 and 8 are already done.
2. **Placeholder scan**: No TBD, TODO, or vague references. All code is shown inline.
3. **Type consistency**: `ToolPolicy` constructor takes `string[] | undefined`, `isToolEnabled` returns `boolean`. Config fields are `string[]`. All consistent across tasks.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-22-tool-allow-denylist.md`.**