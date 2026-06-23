#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# ///
"""Agent Search MCP — Autonomous Development Agent

设一个目标，自动干到完，越干越熟。

用法:
  ~/baby-harness/.venv/bin/python goal.py "添加Yandex搜索引擎"
  ~/baby-harness/.venv/bin/python goal.py "修掉所有类型错误"
  ~/baby-harness/.venv/bin/python goal.py "优化中文搜索结果质量"

原理:
  1. LLM 分解目标为子任务（读/写/测试）
  2. 逐个执行，失败自动重试（最多3次）
  3. 每步记录到 Baby Harness SharedMemory
  4. 完成后跑全量测试验证
  5. 下次目标自动参考历史经验 → 越干越熟
"""

import json
import os
import re
import subprocess
import sys
import traceback
import uuid
from datetime import datetime
from pathlib import Path

# ── Baby Harness ──────────────────────────────────────────
_BH_PATH = Path.home() / "baby-harness" / "src"
if str(_BH_PATH) not in sys.path:
    sys.path.insert(0, str(_BH_PATH))

from baby_harness.models import Task
from baby_harness.queue import TaskQueue
from baby_harness.agent_team import AgentMemory, AgentTeam, TeamRegistry
from baby_harness.coordinator import Coordinator
from baby_harness.executor import MockExecutor
from baby_harness.shared_memory import SharedMemory
from baby_harness.metrics import MetricsCollector
from baby_harness.prompt_cache import PromptCache
from baby_harness.validator import MockValidator
from baby_harness.context_manager import ContextManager

# ── Config ────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / ".goal-harness"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Read DeepSeek API key
LLM_API_KEY = ""
_env_file = Path.home() / ".hermes" / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _key = "DEEPSEEK_API_KEY"
        if _key in _line and "=" in _line:
            LLM_API_KEY = _line.split("=", 1)[1].strip().strip('"').strip("'")
            break

LLM_API_URL = "https://api.deepseek.com/v1/chat/completions"
LLM_MODEL = "deepseek-chat"  # fast for planning
LLM_REASON = "deepseek-reasoner"  # deep for complex tasks


# ── LLM Call ──────────────────────────────────────────────
def _llm(
    prompt: str = "",
    messages: list[dict[str, str]] | None = None,
    model: str = LLM_MODEL,
    max_tokens: int = 4096,
) -> str:
    """Call LLM via DeepSeek API.

    Accepts either a string ``prompt`` (single user message) or a
    full ``messages`` array (for context-managed calls).
    """
    import urllib.request

    if not LLM_API_KEY:
        return "LLM_ERROR: No API key"

    if messages is None:
        messages = [{"role": "user", "content": prompt[:3000]}]
    # Ensure content is not too long
    for m in messages:
        if len(m.get("content", "")) > 4000:
            m["content"] = m["content"][:4000] + "..."

    payload = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }).encode()

    req = urllib.request.Request(
        LLM_API_URL, data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {LLM_API_KEY}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            r = json.loads(resp.read().decode())
            return r.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        err = ""
        if hasattr(e, "read"):
            err = e.read().decode()[:200]
        return f"LLM_ERROR: {e} {err}"


# ── Project Files ─────────────────────────────────────────
def _get_project_files() -> list[Path]:
    src = Path(__file__).parent / "src"
    return sorted(src.rglob("*.ts"))


# ── Baby Harness Setup ────────────────────────────────────
def _setup() -> tuple[Coordinator, TaskQueue, SharedMemory, MetricsCollector]:
    queue = TaskQueue(path=str(DATA_DIR / "queue.json"))
    sm = SharedMemory()
    sm.load(str(DATA_DIR / "shared_memory.json"))
    metrics = MetricsCollector()
    registry = TeamRegistry()
    team = AgentTeam(
        team_id="goal-agent",
        name="Goal Agent",
        domain="general",
        generator=MockExecutor(),
        validator=MockValidator(pass_all=True),
        memory=AgentMemory(agent_id="goal-agent"),
    )
    registry.register(team)
    return Coordinator(queue=queue, registry=registry, shared_memory=sm), queue, sm, metrics


def _save(queue, sm, metrics):
    queue.save()
    sm.save(str(DATA_DIR / "shared_memory.json"))
    mp = DATA_DIR / "metrics.json"
    mp.write_text(json.dumps(metrics.report(), indent=2, default=str))


# ── Step 1: Plan ──────────────────────────────────────────
def step_plan(goal: str, learnings: list[str]) -> list[dict]:
    """分解目标为可执行的子任务列表"""
    files = "\n".join(
        f"  {f.relative_to(Path(__file__).parent)}"
        for f in _get_project_files()
    )
    lr = "\n".join(f"- {l}" for l in learnings[-10:]) if learnings else "(none)"

    prompt = f"""You are a senior TypeScript engineer improving the agent-search-mcp project (multi-engine search MCP server).

## Source files
{files}

## Past learnings (from previous goals)
{lr}

## Goal
{goal}

Break this goal into concrete steps. Each step is one of:
- "read" — read a file to understand it
- "write" — modify a file to implement the change
- "test" — run npm test to verify

Return ONLY a JSON array. No explanation.
[
  {{"step": 1, "action": "read|write|test", "file": "path/to/file.ts", "description": "what to do"}}
]"""

    resp = _llm(prompt)
    start = resp.find("[")
    end = resp.rfind("]") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(resp[start:end])
        except json.JSONDecodeError:
            pass
    return [{"step": 1, "action": "test", "file": "", "description": f"Implement: {goal}"}]


# ── Step 2: Execute ───────────────────────────────────────
def step_execute(action: str, file_path: str, description: str, goal: str,
                 feedback: str = "") -> tuple[bool, str]:
    """执行一个子任务"""
    root = Path(__file__).parent

    if action == "read":
        p = root / file_path
        if p.exists():
            return True, f"--- {file_path} ---\n{p.read_text()}"
        return False, f"File not found: {file_path}"

    elif action == "write":
        p = root / file_path
        current = p.read_text() if p.exists() else ""
        fb = f"\n## Previous attempt feedback\n{feedback}" if feedback else ""

        prompt = f"""Modify the TypeScript file below for the agent-search-mcp project.

Goal: {goal}
Task: {description}
File: {file_path}{fb}

Current content:
```typescript
{current[:4000]}
```

Return ONLY the COMPLETE new file content in a ```typescript block.
Make minimal, targeted changes. Match existing patterns (imports, error handling, etc)."""

        resp = _llm(prompt, model=LLM_MODEL)
        match = re.search(r"```(?:typescript)?\s*\n(.*?)```", resp, re.DOTALL)
        new_content = match.group(1).strip() if match else resp.strip()

        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(new_content + "\n")
        return True, f"✍️ Updated {file_path} ({len(new_content)} chars)"

    elif action == "test":
        result = subprocess.run(
            ["npm", "test"],
            capture_output=True, text=True, timeout=120,
            cwd=root,
        )
        passed = "Test Files" in result.stdout and "passed" in result.stdout
        last = result.stdout.strip().split("\n")[-1] if result.stdout else ""
        err = result.stderr[:300] if result.stderr else ""
        return passed, f"npm test: {'✅ PASS' if passed else '❌ FAIL'}\n{last}\n{err}"

    return True, f"Skipped: {action}"


# ── Commands ──────────────────────────────────────────────
def _cmd_status():
    """Show iteration status."""
    mp = DATA_DIR / "metrics.json"
    if not mp.exists():
        print("📊 No data yet.")
        return
    report = json.loads(mp.read_text())
    print("📊 Development Metrics")
    print("=" * 50)
    for domain, data in report.items():
        if domain == "totals":
            continue
        print(f"\n{domain}:")
        print(f"  Runs:       {data['total']}")
        print(f"  Success:    {data['successes']} ({data['success_rate']*100:.0f}%)")
        print(f"  Avg time:   {data['avg_duration_ms']:.0f}ms")


def _cmd_learnings():
    """Show past learnings."""
    sm = SharedMemory()
    sm.load(str(DATA_DIR / "shared_memory.json"))
    exps = sm.get_relevant_experiences(tags=["goal"])
    if not exps:
        print("📝 No past goals yet.")
        return
    print(f"📝 Past Goals ({len(exps)})")
    print("=" * 50)
    for exp in reversed(exps[-10:]):
        icon = "✅" if exp.success else "❌"
        print(f"  {icon} {exp.content[:80]}")


# ── Main Loop ─────────────────────────────────────────────
def run_goal(goal: str) -> int:
    coord, queue, sm, metrics = _setup()

    # Special commands
    if goal == "status":
        _cmd_status()
        return 0
    if goal == "learnings":
        _cmd_learnings()
        return 0

    # Load past learnings
    past = [e.content for e in sm.get_relevant_experiences(tags=["goal"])]
    print(f"📚 Past experiences: {len(past)}")

    # Step 1: Plan
    print(f"\n🎯 Goal: {goal}")
    print("🤔 Planning...")
    steps = step_plan(goal, past)
    print(f"📋 Plan: {len(steps)} steps")
    for s in steps:
        print(f"   {s['step']}. {s['action']} {s.get('file','')} — {s['description'][:60]}")

    # Execute with context management (DeepSeek 1M, effective ~200K)
    cm = ContextManager(effective_window=200_000, compact_ratio=0.6)
    cm.system_prompt = (
        f"You are a senior TypeScript engineer working on agent-search-mcp "
        f"(a multi-engine search MCP server). Goal: {goal[:80]}"
    )
    global_retries = 0
    step_idx = 0
    failures = []
    last_feedback = ""

    while step_idx < len(steps) and global_retries < 10:
        step = steps[step_idx]
        print(f"\n{'='*50}")
        print(f"🚀 Step {step['step']}/{len(steps)}: {step['description'][:60]}")

        # Check if we need to compact context
        if cm.should_compact():
            print("   📦 Compacting context...")
            cm.compact(lambda text: _llm(
                prompt=f"Compress these completed steps into a short progress summary. "
                       f"Keep decisions, discard implementation details.\n\n{text}",
                max_tokens=500,
            ))
            print(f"   ✅ Compacted. Context: {cm.stats()}")

        success = False
        attempts = 0
        t0 = datetime.now()

        while not success and attempts < 3:
            attempts += 1
            try:
                # Build context-aware messages
                step_prompt = (
                    f"Execute step {step['step']}: {step['description']}"
                    f"\n\nGoal: {goal}"
                )
                if last_feedback and not success:
                    step_prompt += f"\n\nPrevious feedback: {last_feedback[:500]}"

                # Use built context for the LLM call
                ctx_messages = cm.build_messages(add_user_prompt=step_prompt)
                llm_result = _llm(messages=ctx_messages, max_tokens=4000)

                success, result = step_execute(
                    step["action"], step.get("file", ""),
                    step["description"], goal,
                    feedback=last_feedback if not success else "",
                )
            except Exception as e:
                success = False
                result = f"EXCEPTION: {e}\n{traceback.format_exc()}"

            dur = (datetime.now() - t0).total_seconds() * 1000
            icon = "✅" if success else "❌"
            print(f"   {icon} attempt {attempts}: {result[:120]}")

            if not success and attempts < 3:
                last_feedback = result
                global_retries += 1

        # Record
        tid = str(uuid.uuid4())
        queue.add(Task(id=tid, goal=f"[{goal[:30]}] Step {step['step']}",
                        tags=["goal", step["action"]]))
        sm.add_experience(
            experience=f"Step {step['step']}: {'✅' if success else '❌'} "
                       f"{step['description'][:60]} ({dur:.0f}ms)",
            tags=["goal", step["action"], "success" if success else "failure"],
            team_id="goal-agent", success=success,
        )
        metrics.record_execution(step["action"], dur, success)

        # Record step in context manager
        cm.add_step(step["step"], step["description"],
                     "✅ Done" if success else f"❌ Failed: {result[:100]}")

        if not success:
            failures.append((step["step"], step["description"], result))
        step_idx += 1 if success else 0  # retry same step on failure

        # Escape hatch on repeated failures
        if not success and attempts >= 3:
            print("   ⚠️ Step maxed out retries, moving on")
            step_idx += 1

    # Final validation
    print(f"\n{'='*50}")
    print("🔍 Final validation: npm test...")
    final_pass, final_result = step_execute("test", "", "", goal)
    print(f"   {'✅ ALL PASS' if final_pass else '❌ TESTS FAILING'}")

    final_ok = final_pass and len(failures) == 0
    sm.add_experience(
        experience=f"Goal: {goal[:60]} — {'✅ Complete' if final_ok else '⚠️ Partial'} "
        f"({len(steps)} steps, {len(failures)} failures)",
        tags=["goal", "complete" if final_ok else "partial"],
        team_id="goal-agent", success=final_ok,
    )
    metrics.record_execution("goal_complete", 0, final_ok)
    _save(queue, sm, metrics)

    print(f"\n{'='*50}")
    print(f"📊 Report")
    print(f"{'='*50}")
    print(f"  Goal:    {goal}")
    print(f"  Steps:   {len(steps)}")
    print(f"  Failed:  {len(failures)}")
    print(f"  Tests:   {'✅' if final_pass else '❌'}")
    print(f"  Status:  {'✅ Complete' if final_ok else '⚠️ Partial'}")
    if failures:
        print(f"\n  Failures:")
        for s, d, _ in failures:
            print(f"    ❌ Step {s}: {d[:60]}")

    return 0 if final_ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    sys.exit(run_goal(" ".join(sys.argv[1:])))
