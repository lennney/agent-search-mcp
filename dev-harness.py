#!/usr/bin/env python3
"""Agent Search MCP — Baby Harness 开发迭代助手

用法:
  python3 dev-harness.py test          # 运行测试 + 记录结果
  python3 dev-harness.py run <query>   # 跑一条搜索验证  
  python3 dev-harness.py status        # 查看迭代状态
  python3 dev-harness.py learnings     # 查看学习记录

注意：需要用 baby-harness 虚拟环境的 Python 运行：
  ~/baby-harness/.venv/bin/python dev-harness.py <command>
"""

import json
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Add baby-harness to path
_BH_PATH = Path.home() / "baby-harness" / "src"
if str(_BH_PATH) not in sys.path:
    sys.path.insert(0, str(_BH_PATH))

# Baby Harness imports
from baby_harness.models import Task, TaskStatus
from baby_harness.queue import TaskQueue
from baby_harness.agent_team import AgentMemory, AgentTeam, TeamRegistry
from baby_harness.coordinator import Coordinator
from baby_harness.executor import HermesExecutor, MockExecutor
from baby_harness.shared_memory import SharedMemory
from baby_harness.metrics import MetricsCollector
from baby_harness.validator import MockValidator


DATA_DIR = Path(__file__).parent / ".dev-harness"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _setup() -> tuple[Coordinator, TaskQueue, SharedMemory, MetricsCollector]:
    queue = TaskQueue(path=str(DATA_DIR / "queue.json"))
    sm = SharedMemory()
    sm.load(str(DATA_DIR / "shared_memory.json"))
    metrics = MetricsCollector()

    registry = TeamRegistry()
    team = AgentTeam(
        team_id="search-dev",
        name="Search Dev Team",
        domain="general",
        generator=MockExecutor(),
        validator=MockValidator(pass_all=True),
        memory=AgentMemory(agent_id="search-dev"),
    )
    registry.register(team)

    return (
        Coordinator(queue=queue, registry=registry, shared_memory=sm),
        queue, sm, metrics,
    )


def _save(queue, sm, metrics):
    queue.save()
    sm.save(str(DATA_DIR / "shared_memory.json"))
    metrics_path = DATA_DIR / "metrics.json"
    metrics_path.write_text(json.dumps(metrics.report(), indent=2, default=str))


def cmd_test():
    """运行项目测试并记录结果"""
    coord, queue, sm, metrics = _setup()

    print("🧪 Running agent-search-mcp tests...")
    start = datetime.now()
    result = subprocess.run(
        ["npm", "test"],
        capture_output=True, text=True, timeout=120,
        cwd=Path(__file__).parent,
    )
    duration = (datetime.now() - start).total_seconds() * 1000

    # Parse test results
    passed = "Test Files" in result.stdout and "passed" in result.stdout
    task = Task(
        id=str(uuid.uuid4()),
        goal=f"run test suite",
        tags=["test", "regression"],
    )

    task_id = task.id
    queue.add(task)
    coord.execute_task(task)

    sm.add_experience(
        experience=f"Test run: {'✅ PASS' if passed else '❌ FAIL'} ({duration:.0f}ms)",
        tags=["test", "regression"],
        team_id="search-dev",
        success=passed,
    )
    metrics.record_execution("test", duration, passed)

    _save(queue, sm, metrics)
    print(f"\n{'✅ PASS' if passed else '❌ FAIL'} — {duration:.0f}ms")
    if not passed:
        print(result.stderr[:500])
    return 0 if passed else 1


def cmd_run(query: str):
    """通过 fasm CLI 跑一条搜索并记录"""
    coord, queue, sm, metrics = _setup()

    print(f"🔍 Searching: {query}")
    start = datetime.now()
    result = subprocess.run(
        ["npx", "fasm", query],
        capture_output=True, text=True, timeout=30,
        cwd=Path(__file__).parent,
    )
    duration = (datetime.now() - start).total_seconds() * 1000

    success = result.returncode == 0 and len(result.stdout) > 50
    task = Task(
        id=str(uuid.uuid4()),
        goal=query,
        tags=["search", "e2e"],
    )
    queue.add(task)

    sm.add_experience(
        experience=f"Search '{query[:40]}': {'✅' if success else '❌'} ({duration:.0f}ms, {len(result.stdout)} bytes)",
        tags=["search", "e2e"],
        team_id="search-dev",
        success=success,
    )
    metrics.record_execution("search", duration, success)

    _save(queue, sm, metrics)
    status = "✅" if success else "❌"
    print(f"{status} {duration:.0f}ms, {len(result.stdout)} bytes")
    if result.stdout:
        print(result.stdout[:300])
    return 0 if success else 1


def cmd_status():
    """查看开发迭代状态"""
    metrics_path = DATA_DIR / "metrics.json"
    if not metrics_path.exists():
        print("📊 No data yet. Run tests or search queries first.")
        return

    report = json.loads(metrics_path.read_text())
    print("📊 Development Metrics")
    print("=" * 50)
    for domain, data in report.items():
        if domain == "totals":
            continue
        print(f"\n{domain}:")
        print(f"  Runs:       {data['total']}")
        print(f"  Success:    {data['successes']} ({data['success_rate']*100:.0f}%)")
        print(f"  Avg time:   {data['avg_duration_ms']:.0f}ms")


def cmd_learnings():
    """查看学习记录"""
    sm = SharedMemory()
    sm.load(str(DATA_DIR / "shared_memory.json"))
    exps = sm.get_relevant_experiences()
    if not exps:
        print("📝 No learnings yet.")
        return
    print("📝 Learnings")
    print("=" * 50)
    for exp in exps:
        print(f"  [{exp.team_id}] {exp.content[:80]}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    if command == "test":
        sys.exit(cmd_test())
    elif command == "run" and len(sys.argv) > 2:
        sys.exit(cmd_run(" ".join(sys.argv[2:])))
    elif command == "status":
        cmd_status()
    elif command == "learnings":
        cmd_learnings()
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)
