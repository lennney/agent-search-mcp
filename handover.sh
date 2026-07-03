#!/bin/bash
# handover.sh — /handover slash command
# 生成当前 session 的进度摘要，写到 HANDOVER.md
# 用法: agent 在 session 中调用 /handover

set -euo pipefail

HANDOVER_FILE="HANDOVER.md"
DATE=$(date '+%Y-%m-%d %H:%M')
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# 收集变更
CHANGED_FILES=$(git diff --name-only 2>/dev/null || echo "")
CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -c . || true)
DIFF_STAT=$(git diff --stat 2>/dev/null || echo "")
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l || echo "0")

# 检查 HANDOVER 是否超过 80 行（需要归档）
if [ -f "$HANDOVER_FILE" ]; then
  LINES=$(wc -l < "$HANDOVER_FILE")
  if [ "$LINES" -gt 80 ]; then
    echo "⚠ HANDOVER.md 超过 80 行 ($LINES)，建议归档。运行:"
    echo "  mkdir -p docs/history && mv $HANDOVER_FILE docs/history/$(date '+%Y-%m').md"
    echo "  然后重新创建 $HANDOVER_FILE"
  fi
fi

# 生成摘要
cat << EOF
# /handover 摘要

## 基本信息
- 时间: $DATE
- 分支: $BRANCH
- 未提交文件: $UNCOMMITTED

## 变更文件
$(if [ "$CHANGED_COUNT" -gt 0 ]; then echo "\`\`\`"; echo "$CHANGED_FILES"; echo "\`\`\`"; else echo "(无)"; fi)

## 统计
$(if [ -n "$DIFF_STAT" ]; then echo "\`\`\`"; echo "$DIFF_STAT"; echo "\`\`\`"; fi)

## 操作建议
1. 更新 HANDOVER.md 的"已完成"和"关键决策"
2. 如有架构级决策，写 ADR 到 docs/decisions/
3. 如有新陷阱，更新 AGENTS.md
EOF
