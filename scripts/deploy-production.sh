#!/usr/bin/env bash
set -euo pipefail

# Production Deployment Script for Seance
# Usage: ./scripts/deploy-production.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Docker Hub username (update in kubernetes/cdk8s/src/config.ts if needed)
DOCKER_USERNAME="fractalhuman1"

# Get current git commit hash (short form)
GIT_COMMIT=$(git rev-parse --short HEAD)
echo "📦 Building images for commit: $GIT_COMMIT"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Warning: You have uncommitted changes"
  echo "   Deployed code won't match git history exactly"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Verify required environment variables
if [ -z "${DIGITALOCEAN_TOKEN:-}" ]; then
  echo "Error: DIGITALOCEAN_TOKEN not set"
  exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN not set"
  exit 1
fi

# Docker Hub login check
echo "🔐 Checking Docker Hub authentication..."
if ! docker info | grep -q "Username: $DOCKER_USERNAME"; then
  echo "Please log in to Docker Hub:"
  docker login
fi

# Build backend image
echo "🏗️  Building backend image..."
docker build \
  -f "$REPO_ROOT/images/backend.dockerfile" \
  -t "$DOCKER_USERNAME/seance-backend:$GIT_COMMIT" \
  -t "$DOCKER_USERNAME/seance-backend:latest" \
  "$REPO_ROOT/backend-trpc"

# Build landing page image
echo "🏗️  Building landing page image..."
docker build \
  -f "$REPO_ROOT/images/landing.dockerfile" \
  -t "$DOCKER_USERNAME/seance-landing:$GIT_COMMIT" \
  -t "$DOCKER_USERNAME/seance-landing:latest" \
  "$REPO_ROOT/landing-page"

# Push to Docker Hub
echo "⬆️  Pushing images to Docker Hub..."
docker push "$DOCKER_USERNAME/seance-backend:$GIT_COMMIT"
docker push "$DOCKER_USERNAME/seance-backend:latest"
docker push "$DOCKER_USERNAME/seance-landing:$GIT_COMMIT"
docker push "$DOCKER_USERNAME/seance-landing:latest"

# Regenerate Kubernetes manifests with git commit hash
echo "🔧 Regenerating Kubernetes manifests..."
cd "$REPO_ROOT/kubernetes/cdk8s"
export GIT_COMMIT
npm run synth

# Return to repo root
cd "$REPO_ROOT"

# Run OpenTofu
echo "🚀 Deploying to Kubernetes..."
tofu init -upgrade
tofu apply

# Show deployment info
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Images deployed:"
echo "  - $DOCKER_USERNAME/seance-backend:$GIT_COMMIT"
echo "  - $DOCKER_USERNAME/seance-landing:$GIT_COMMIT"
echo ""
echo "Git commit: $GIT_COMMIT"
echo "Git branch: $(git branch --show-current)"
echo ""
echo "Verify deployment:"
echo "  export KUBECONFIG=$REPO_ROOT/.kube/config"
echo "  kubectl get pods -n seance-prod"
echo "  kubectl describe deployment backend -n seance-prod | grep Image"
echo ""
echo "Test endpoints:"
echo "  curl -I https://backend.seance.dev/"
echo "  curl -I https://seance.dev/"
