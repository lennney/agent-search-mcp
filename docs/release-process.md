# Release Process

> Agent 发布流程规范。每次发布前按此 checklist 执行，确保质量一致性。

## 版本号规则 (Semver)

| 变更类型 | 版本 | 示例 |
|----------|------|------|
| MCP 工具接口签名变更、响应格式变更 | MAJOR | 3.0.0 → 4.0.0 |
| 新引擎、新工具、重大架构变更 | MINOR | 3.0.0 → 3.1.0 |
| Bug 修复、文档、小优化 | PATCH | 3.1.0 → 3.1.1 |

**约束**：
- 每周最多 1 次 publish（patch 版本只留给 bugfix）
- 小文档改动、CI 调整不触发版本号变更
- 版本号在 CHANGELOG 和 package.json 中保持一致

## 发布前检查清单

```
[ ] npm test — 全部测试通过
[ ] npm run build — 编译无错误
[ ] CHANGELOG.md [Unreleased] 区完整记录了所有变更
[ ] HANDOVER.md "版本" 和 "下一步方向" 已更新
[ ] AGENTS.md "已知陷阱" 反映了最新状态
[ ] README.md badges 数据准确（测试数、版本号等）
[ ] llms.txt 内容与当前版本一致
[ ] npm config get registry → https://registry.npmjs.org/
[ ] git status 干净（无未提交变更）
[ ] git log 确认没有意外提交
```

## 发布步骤

### 1. 整理 CHANGELOG

将 `[Unreleased]` 区的条目移到新版本号下，按以下格式：

```markdown
## vX.Y.Z (YYYY-MM-DD)

### 🎉 Headline Feature (如有重大功能)

一句话描述最大亮点。

### 分类

- **Added**: 新功能、新引擎、新工具
- **Changed**: 行为变更、默认值变更
- **Fixed**: Bug 修复
- **Removed**: 废弃或删除的功能

### 📊 Stats

- Tests: N passing, N test files
- Key metrics

---

## [Unreleased]
```

### 2. 更新版本号

```bash
# package.json: "version": "X.Y.Z"
# 修改后验证
npm run build
```

### 3. 提交 + 打标签

```bash
git add .
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

### 4. 发布到 npm

```bash
npm publish
```

### 5. 发布后

- [ ] 在 GitHub 创建 Release（从 tag 生成，粘贴 CHANGELOG 内容）
- [ ] 更新 HANDOVER.md 版本号
- [ ] 清空 CHANGELOG [Unreleased] 区（或保留为占位）
- [ ] 验证 `npm install -g agent-search-mcp` 可安装最新版

## Agent 执行指南

Agent 执行发布流程时，按以下顺序：

1. **读 CHANGELOG.md** — 确认 [Unreleased] 区有内容
2. **读 HANDOVER.md** — 确认版本号和建议
3. **跑检查清单** — 逐项验证
4. **确定版本号** — 根据变更类型和 semver 规则
5. **整理 CHANGELOG** — 将 [Unreleased] 移到新版
6. **更新版本号** — 修改 package.json
7. **提交打标签** — commit + tag
8. **发布** — npm publish
9. **发布后清理** — GitHub Release, 更新 HANDOVER

## 常见陷阱

- **npm registry 不是 npmjs.org**：中国用户常设腾讯镜像，publish 前必须切回
- **标签已存在**：`git tag -d vX.Y.Z` 删除本地，`git push origin :refs/tags/vX.Y.Z` 删除远程
- **版本号跳跃**：不要从 3.0.0 直接跳到 4.0.0，除非有 breaking change
- **CHANGELOG 丢失**：每次 feature 完成后立即更新 [Unreleased]，不要等发布前集中补
- **npm publish 失败**：检查是否已登录 (`npm whoami`)，检查包名是否已被占用