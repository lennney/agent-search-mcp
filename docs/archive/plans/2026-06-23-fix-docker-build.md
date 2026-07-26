# Fix Docker Build & Push to GHCR & ACR

## 问题

GitHub Actions workflow "Build and Push to GHCR & ACR" 在 `v2.1.0` tag 构建失败。

**根因：**
1. `dist/` 在 `.gitignore` 中，未被 git 跟踪
2. Workflow 没有 `npm run build` 步骤
3. Dockerfile `COPY dist/ ./dist/` 找不到目录 → 构建失败
4. Workflow 中镜像名写死 `open-web-search`，实际应该是 `agent-search-mcp`

## 改动清单

### Task 1: 重写 Dockerfile（多阶段构建）

**文件：** `Dockerfile`

从当前单阶段构建改为多阶段构建，编译在 Docker 内完成，不再依赖 CI 预编译。同时升级 Node 18 → 20（18 已 EOL）。

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY README.md README_zh.md LICENSE CHANGELOG.md ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**验收标准：**
- [ ] Dockerfile 能以 `docker build` 成功构建
- [ ] 构建产物镜像能正常启动：`docker run --rm agent-search-mcp:test node dist/index.js --help`
- [ ] 镜像大小 < 150MB（Node 20-alpine 基础 ~120MB + 代码）
- [ ] 不再需要 CI 预编译 TypeScript

### Task 2: 修复 docker.yml

**文件：** `.github/workflows/docker.yml`

改动：
1. 镜像名 `open-web-search` → `agent-search-mcp`
2. 更新 actions 版本：`checkout@v3` → `@v4`，`build-push-action@v5` → `@v6`

多阶段构建已在 Dockerfile 内完成编译，workflow 不需要预编译步骤。

```yaml
name: Build and Push to GHCR & ACR

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Log in to Aliyun ACR
        if: ${{ secrets.ACR_REGISTRY != '' }}
        uses: docker/login-action@v3
        with:
          registry: ${{ secrets.ACR_REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Prepare tags
        id: tags
        run: |
          REPO_LOWERCASE="ghcr.io/$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')/agent-search-mcp"
          VERSION_TAG="${GITHUB_REF##*/}"
          TAGS="${REPO_LOWERCASE}:latest,${REPO_LOWERCASE}:${VERSION_TAG}"

          if [ -n "${{ secrets.ACR_REGISTRY }}" ] && [ -n "${{ secrets.ACR_IMAGE_NAME }}" ]; then
            ACR_REPO="${{ secrets.ACR_REGISTRY }}/${{ secrets.ACR_IMAGE_NAME }}"
            TAGS="${TAGS},${ACR_REPO}:latest,${ACR_REPO}:${VERSION_TAG}"
          fi

          echo "tags<<EOF" >> $GITHUB_OUTPUT
          echo "$TAGS" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Build and Push Multi-Platform Docker Image
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.tags.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**验收标准：**
- [ ] 工作流语法正确（GitHub Actions 无 syntax error）
- [ ] 镜像 tag 正确：`ghcr.io/lennney/agent-search-mcp:*`
- [ ] ACR tag 正确：`$ACR_REGISTRY/$ACR_IMAGE_NAME:*`
- [ ] Multi-platform 构建正常（amd64 + arm64）

### Task 3: 本地验证构建

```bash
cd ~/agent-search-mcp
docker build -t agent-search-mcp:test .
docker run --rm agent-search-mcp:test node dist/index.js --help
```

**注意：** 当前服务器没有 Docker，验证需要在有 Docker 的环境执行。可以写完后提交 PR，让 CI 跑一遍验证。

## 依赖顺序

1. Task 1（Dockerfile） → 2. Task 2（workflow） → 3. Task 3（本地验证）

先改 Dockerfile 再改 workflow，因为 workflow 依赖 Dockerfile 的存在。

## 不涉及

- 不修改任何 `.ts` 源文件
- 不修改 `.dockerignore`（当前已正确忽略 dist/）
- 不修改 package.json 或 tsconfig.json
- 不涉及 ACR secret 配置（需要在 GitHub repo settings 中配）
