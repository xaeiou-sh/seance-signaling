#!/usr/bin/env bash
set -euo pipefail

# Build and Push Docker Images
# Usage: ./scripts/build-images.sh [commit-hash]
#
# Builds all Docker images and pushes them to Docker Hub.
# If commit-hash is not provided, uses current git commit.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Docker Hub username
DOCKER_USERNAME="fractalhuman1"

# Get git commit hash (use provided arg or current commit)
GIT_COMMIT="${1:-$(git rev-parse --short HEAD)}"

echo "📦 Building images for commit: $GIT_COMMIT"
echo ""

# Check for uncommitted changes (warning only)
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Warning: You have uncommitted changes"
  echo "   Deployed code won't match git history exactly"
  echo "   Continuing build..."
  echo ""
fi

# Verify required environment variables
if [ -z "${DIGITALOCEAN_TOKEN:-}" ]; then
  echo "⚠️  Warning: DIGITALOCEAN_TOKEN not set"
  echo "   (Required for Terraform, but not for building images)"
  echo ""
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "⚠️  Warning: CLOUDFLARE_API_TOKEN not set"
  echo "   (Required for Terraform, but not for building images)"
  echo ""
fi

# Docker Hub login check
echo "🔐 Checking Docker Hub authentication..."
if ! docker info | grep -q "Username: $DOCKER_USERNAME"; then
  echo "Please log in to Docker Hub:"
  docker login
fi

# Build and push backend image (cross-compile for linux/amd64)
echo ""
echo "🏗️  Building and pushing backend image for linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  -f "$REPO_ROOT/backend-trpc/Dockerfile" \
  -t "$DOCKER_USERNAME/seance-backend:$GIT_COMMIT" \
  --push \
  "$REPO_ROOT"

# Build and push landing page image (cross-compile for linux/amd64)
echo ""
echo "🏗️  Building and pushing landing page image for linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  --build-arg VITE_BACKEND_URL=https://backend.seance.dev \
  -f "$REPO_ROOT/landing-page/Dockerfile" \
  -t "$DOCKER_USERNAME/seance-landing:$GIT_COMMIT" \
  --push \
  "$REPO_ROOT"

# Build and push beholder (PostHog proxy) image
echo ""
echo "🏗️  Building and pushing beholder image..."
docker buildx build \
  --platform linux/amd64 \
  -f "$REPO_ROOT/beholder/Dockerfile" \
  -t "$DOCKER_USERNAME/seance-beholder:$GIT_COMMIT" \
  --push \
  "$REPO_ROOT/beholder"

# Build and push litellm image with custom config
echo ""
echo "🏗️  Building and pushing litellm image..."
docker buildx build \
  --platform linux/amd64 \
  -f "$REPO_ROOT/litellm/Dockerfile" \
  -t "$DOCKER_USERNAME/seance-litellm:$GIT_COMMIT" \
  --push \
  "$REPO_ROOT/litellm"

# Show summary
echo ""
echo "✅ All images built and pushed successfully!"
echo ""
echo "Images:"
echo "  - $DOCKER_USERNAME/seance-backend:$GIT_COMMIT"
echo "  - $DOCKER_USERNAME/seance-landing:$GIT_COMMIT"
echo "  - $DOCKER_USERNAME/seance-beholder:$GIT_COMMIT"
echo "  - $DOCKER_USERNAME/seance-litellm:$GIT_COMMIT"
echo ""
echo "Git commit: $GIT_COMMIT"
echo "Git branch: $(git branch --show-current)"
