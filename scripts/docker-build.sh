#!/bin/bash
# docker-build.sh — Build and optionally push agent-search-mcp Docker image
set -euo pipefail

IMAGE_NAME="agent-search-mcp"
VERSION=$(node -e "console.log(require('./package.json').version)")
REGISTRY="${1:-ghcr.io}"

echo "Building ${IMAGE_NAME}:${VERSION} for ${REGISTRY}..."

docker build -t "${IMAGE_NAME}:${VERSION}" -t "${IMAGE_NAME}:latest" .

echo ""
echo "Done. To push:"
echo "  docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/lennney/${IMAGE_NAME}:${VERSION}"
echo "  docker push ${REGISTRY}/lennney/${IMAGE_NAME}:${VERSION}"
echo ""
echo "Examples:"
echo "  # Build and tag for ghcr.io (default)"
echo "  ./scripts/docker-build.sh"
echo ""
echo "  # Build and tag for Docker Hub"
echo "  ./scripts/docker-build.sh docker.io"
echo ""
echo "  # Push to ghcr.io after build"
echo "  docker tag ${IMAGE_NAME}:${VERSION} ghcr.io/lennney/${IMAGE_NAME}:${VERSION}"
echo "  docker push ghcr.io/lennney/${IMAGE_NAME}:${VERSION}"
