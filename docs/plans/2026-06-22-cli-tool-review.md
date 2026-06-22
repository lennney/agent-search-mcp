# CLI Tool Implementation Plan — Review

**Plan:** `/home/ubuntu/agent-search-mcp/docs/plans/2026-06-22-cli-tool.md`
**Review date:** 2026-06-22
**Verdict: REQUEST_CHANGES**

---

## Checklist

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | **Task granularity (2-5 min each)** | ❌ FAIL | Task 1 estimated at 30 min — far exceeds 2-5 min target. Needs decomposition. |
| 2 | **File paths (exact, not vague)** | ✅ PASS | All paths are exact: `src/cli.ts`, `tests/cli.test.ts`, `package.json`, `README_zh.md`. |
| 3 | **Code examples (complete, copy-pasteable)** | ❌ FAIL | Task 2 shows only JSON fragments (not a full patch). Task 3 is complete. Implementation code is complete. |
| 4 | **Commands (exact with expected output)** | ⚠️ PARTIAL | Commands are exact. Task 1 Step 2 expected output is vague (`"FAIL — Cannot find module"`). Should show the actual error. |
| 5 | **TDD (test first, code second)** | ✅ PASS | Task 1 properly follows TDD: failing test → verify failure → implementation → verify pass. |
| 6 | **Verification steps (prove each task works)** | ⚠️ PARTIAL | Unit test verification is solid. But acceptance criteria #2-6 (end-to-end CLI runs) lack explicit verification commands until Task 2 completes. |
| 7 | **DRY (no unnecessary repetition)** | ✅ PASS | No unnecessary repetition in code examples or documentation. |
| 8 | **YAGNI (nothing over-engineered)** | ✅ PASS | `process.argv` with no external dependencies is appropriately minimal. `cli:http` script is slightly redundant but harmless. |
| 9 | **Missing context** | ❌ FAIL | Several issues: (a) `tsx` not in dependencies — scripts won't work as written; (b) no mention of updating `tsconfig.json` `include` or verifying `dist/cli.js` is in `files` field; (c) no `tsc --noEmit` type check step. |
| 10 | **Backward compatible** | ❌ FAIL | Plan's `bin` entry overwrites the existing `"agent-search-mcp": "./dist/index.js"` — breaks MCP server invocation. |
| 11 | **Dependencies (tasks in correct order)** | ✅ PASS | Task 1 → 2 → 3 is logical. Tests can run before Task 2 due to Vitest's TS handling. |
| 12 | **Integration (new code integrates cleanly)** | ⚠️ PARTIAL | Imports from existing modules are correct. But no integration test or mention of how CLI coexists with existing `src/index.ts` MCP server entry point. |

---

## Issues

### 🔴 Issue 1: Task 1 is too large — violates granularity target

**Location:** Task 1 (lines 13–256)

**Problem:** Estimated at **30 minutes**, far exceeding the 2–5 minute per-task guideline. The task bundles:
- Writing tests (5+ test cases)
- Writing implementation (~160 lines)
- Running tests twice
- Git commit

**Recommendation:** Split into 6 smaller tasks:
- Task 1a: Write failing `parseArgs` test (3 min)
- Task 1b: Implement `parseArgs` function (5 min)
- Task 1c: Write `showHelp` and `main` with search command (3 min)
- Task 1d: Implement extract and serve commands in `main` (3 min)
- Task 1e: Run tests and fix (3 min)
- Task 1f: Final integration — add git commit (2 min)

---

### 🔴 Issue 2: `tsx` is not a dependency — scripts won't work

**Location:** Task 2 (line 284–285)

**Problem:** The plan adds these scripts:
```json
"cli": "npx tsx src/cli.ts",
"cli:http": "npx tsx src/cli.ts serve --port 3000"
```
But **`tsx` is not in `devDependencies`** (current: `@types/node`, `typescript`, `vitest` only). The existing project uses `tsc && node dist/...` for scripts.

Using `npx tsx` would work if `tsx` resolves, but it's fragile — `npx` fetches from npm on first use, and isn't guaranteed to be available in all environments (offline builds, CI, etc.).

**Recommendation:** Either:
- (a) Follow the existing pattern: `"cli": "tsc && node dist/cli.js"`
- (b) Add `tsx` to `devDependencies` explicitly

Option (a) is preferred for consistency with existing scripts (`dev`, `dev:http`, etc.).

---

### 🔴 Issue 3: Backward compatibility broken — `bin` overwrites MCP server entry

**Location:** Task 2 (line 282)

**Problem:** Current `package.json`:
```json
"bin": {
  "agent-search-mcp": "./dist/index.js"
}
```
Plan proposes:
```json
"bin": {
  "agent-search-mcp": "./dist/cli.js"
}
```
This **overwrites** the existing `bin` entry. Running `npx agent-search-mcp` would now start the CLI instead of the MCP server. Existing users and integrations would break.

**Recommendation:** Choose one of these approaches:
- **Option A:** Rename the CLI binary (e.g., `"agent-search-mcp-cli": "./dist/cli.js"`) and keep the existing `"agent-search-mcp"` bin pointing to the MCP server.
- **Option B:** Make `dist/cli.js` the canonical entry point and detect mode from args: if no CLI arguments are given and no command is recognized, start the MCP server (i.e., `src/cli.ts` wraps the MCP server logic).
- **Option C:** Add a `"agent-search-mcp"` script in `scripts` section only (not `bin`), so it's only accessible via `npm run cli`.

Option B is the most user-friendly but the most work. Option A is the safest for backward compatibility. Option C is the simplest but doesn't provide global CLI access.

---

### 🔴 Issue 4: English README (`README.md`) not updated

**Location:** Task 3 (lines 309–367)

**Problem:** The plan only adds CLI documentation to `README_zh.md`. The project has two READMEs — `README.md` (English) and `README_zh.md` (Chinese). The English README already has corresponding sections for the Chinese one (they mirror each other). Adding CLI docs solely to the Chinese README leaves English users without CLI documentation.

**Recommendation:** Add the same CLI section to `README.md` (English), or at minimum add both in the plan.

---

### 🔴 Issue 5: `as any` type cast

**Location:** Task 1 (line 187)

**Problem:**
```typescript
engines: (args.engines || ['duckduckgo', 'sogou']) as any,
```
`as any` bypasses TypeScript type checking. The `searchWithFallback` expects `SearchProvider[]` (`'duckduckgo' | 'sogou' | 'bing' | 'baidu' | 'brave' | 'tavily'`). The `CliArgs.engines` field is typed as `string[]`, which requires a cast, but `as any` is too aggressive.

**Recommendation:** Type `CliArgs.engines` as `SearchProvider[]` (imported from free-search) or at minimum use `as SearchProvider[]`.

---

### ⚠️ Issue 6: Missing `tsconfig.json` consideration

**Location:** Task 1–2

**Problem:** `tsconfig.json` has `"include": ["src/**/*"]` and `"rootDir": "./src"`. The new `src/cli.ts` is included automatically, so compilation works. However, the plan doesn't mention verifying:
- That `dist/cli.js` is properly emitted (it will be, but should be verified)
- That the `files` field in `package.json` includes `dist/cli.js` (currently `["dist/**", ...]` so it's included, but worth noting)

**Recommendation:** Add a verification step to run `tsc` and confirm `dist/cli.js` exists.

---

### ⚠️ Issue 7: `parseArgs` mutates input array

**Location:** Task 1 (line 110)

**Problem:**
```typescript
if (first === 'search' || first === 'extract' || first === 'serve') {
  result.command = first;
  args.shift();  // mutates the input array
}
```
`args.shift()` mutates the `argv` array. While this works in practice (callers always pass a new array), it's a surprising side effect. The test creates arrays inline, so it's not affected, but it's a code smell.

**Recommendation:** Use a separate index variable or slice instead of mutating the input. E.g.:
```typescript
let i = 0;
if (...commands.includes(args[i])) {
  result.command = args[i] as CliArgs['command'];
  i++;
}
// ... use a for loop starting from i
```

---

### ⚠️ Issue 8: Task 1 verification steps don't include type-checking

**Location:** Task 1 (Step 4)

**Problem:** The verification step only runs `npx vitest run tests/cli.test.ts`. No `tsc --noEmit` or build step to verify TypeScript compilation.

**Recommendation:** Add a step `npx tsc --noEmit` between implementation and test run to catch type errors early.

---

### ⚠️ Issue 9: `cli:http` script may be YAGNI-ish

**Location:** Task 2 (line 285)

**Problem:** `"cli:http": "npx tsx src/cli.ts serve --port 3000"` is just `npm run cli -- serve --port 3000` with a default port. This is a minor convenience but adds maintenance overhead and is barely useful. Since the project already has `dev:http` and `start:http` scripts for the MCP server, this third HTTP script adds confusion.

**Recommendation:** Remove `cli:http` or rename it to match the existing convention (e.g., `cli:serve`).

---

## Summary

### Pass: 5/12 criteria
(Task granularity ✅, File paths ✅, TDD ✅, DRY ✅, YAGNI ✅, Task order ✅)

### Fail: 4/12 criteria
(Task granularity ❌, Code examples ❌, Missing context ❌, Backward compat ❌)

### Partial: 3/12 criteria
(Commands ⚠️, Verification steps ⚠️, Integration ⚠️)

### Verdict: **REQUEST_CHANGES**

The plan is fundamentally sound in intent (CLI with process.argv, no extra deps, delegates to existing functions), but has **5 critical issues** that must be resolved before implementation:

1. **Task 1 is 30 min** — needs splitting into 2-5 min subtasks
2. **`tsx` not available** — scripts must use `tsc && node dist/cli.js` or add `tsx` dependency
3. **`bin` overwrite breaks backward compat** — CLI binary name must not shadow the existing MCP server entry
4. **English README skipped** — both `README.md` and `README_zh.md` need CLI docs
5. **`as any` type cast** — should use proper type

Once these are addressed, the plan will be ready for implementation.
