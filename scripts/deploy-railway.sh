#!/usr/bin/env bash
set -euo pipefail

# Railway Production Deployment Script for Seance
# Usage: ./scripts/deploy-railway.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Docker Hub username
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

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "Error: RAILWAY_TOKEN not set"
  echo "Get your token from: https://railway.app/account/tokens"
  exit 1
fi

# Check Railway CLI is installed
if ! command -v railway &> /dev/null; then
  echo "Error: Railway CLI not found"
  echo "Install with: brew install railway"
  exit 1
fi

# Check Railway CLI is authenticated
echo "🔐 Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
  echo "Railway CLI not authenticated. Logging in..."
  railway login
fi

# Docker Hub login check
echo "🔐 Checking Docker Hub authentication..."
if ! docker info | grep -q "Username: $DOCKER_USERNAME"; then
  echo "Please log in to Docker Hub:"
  docker login
fi

# Build and push backend image (cross-compile for linux/amd64)
echo "🏗️  Building and pushing backend image for linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  -f "$REPO_ROOT/backend-trpc/Dockerfile" \
  -t "$DOCKER_USERNAME/seance-backend:$GIT_COMMIT" \
  --push \
  "$REPO_ROOT"

# Build and push landing page image (cross-compile for linux/amd64)
echo "🏗️  Building and pushing landing page image for linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  --build-arg VITE_BACKEND_URL=https://backend.seance.dev \
  -f "$REPO_ROOT/landing-page/Dockerfile" \
  -t "$DOCKER_USERNAME/seance-landing:$GIT_COMMIT" \
  --push \
  "$REPO_ROOT"

# Build and push beholder (PostHog proxy) image
echo "🏗️  Building and pushing beholder image..."
docker buildx build \
  --platform linux/amd64 \
  -f "$REPO_ROOT/beholder/Dockerfile" \
  -t "$DOCKER_USERNAME/seance-beholder:$GIT_COMMIT" \
  --push \
  "$REPO_ROOT/beholder"

# Build and push litellm image with custom config
echo "🏗️  Building and pushing litellm image..."
docker buildx build \
  --platform linux/amd64 \
  -f "$REPO_ROOT/litellm/Dockerfile" \
  -t "$DOCKER_USERNAME/seance-litellm:$GIT_COMMIT" \
  --push \
  "$REPO_ROOT/litellm"

# Run Terraform to create/update Railway infrastructure
echo "🚀 Deploying to Railway via Terraform..."
cd "$REPO_ROOT"
export TF_VAR_git_commit=$GIT_COMMIT
tofu init -upgrade
tofu apply -auto-approve

# Apply secrets to Railway services
echo "🔐 Applying secrets to Railway services..."
"$REPO_ROOT/scripts/apply-railway-secrets.sh" production

# Show deployment info
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Images deployed:"
echo "  - $DOCKER_USERNAME/seance-backend:$GIT_COMMIT"
echo "  - $DOCKER_USERNAME/seance-landing:$GIT_COMMIT"
echo "  - $DOCKER_USERNAME/seance-beholder:$GIT_COMMIT"
echo "  - $DOCKER_USERNAME/seance-litellm:$GIT_COMMIT"
echo ""
echo "Git commit: $GIT_COMMIT"
echo "Git branch: $(git branch --show-current)"
echo ""

# Check if this is first deployment (CNAMEs not set)
if grep -q "railway_cname_backend" "$REPO_ROOT/terraform.tfvars" && \
   ! grep -q '^railway_cname_backend = ".*\.up\.railway\.app"' "$REPO_ROOT/terraform.tfvars"; then
  echo "⚠️  FIRST DEPLOYMENT - DNS Setup Required"
  echo ""
  echo "Railway services created, but Cloudflare DNS not configured yet."
  echo ""
  echo "Next steps:"
  echo "  1. Get CNAMEs from Railway:"
  echo "     railway domain list"
  echo ""
  echo "  2. Add CNAMEs to terraform.tfvars:"
  echo "     railway_cname_backend   = \"abc123.up.railway.app\""
  echo "     railway_cname_landing   = \"def456.up.railway.app\""
  echo "     railway_cname_signaling = \"ghi789.up.railway.app\""
  echo "     railway_cname_beholder  = \"jkl012.up.railway.app\""
  echo "     railway_cname_litellm   = \"mno345.up.railway.app\""
  echo ""
  echo "  3. Run terraform again to create DNS:"
  echo "     export TF_VAR_git_commit=$GIT_COMMIT"
  echo "     tofu apply"
  echo ""
  echo "See RAILWAY-QUICKSTART.md for detailed instructions."
else
  echo "Verify deployment:"
  echo "  railway status"
  echo "  railway logs --service backend"
  echo ""
  echo "Test endpoints:"
  echo "  curl -I https://backend.seance.dev/"
  echo "  curl -I https://seance.dev/"
  echo "  curl -I https://signaling.seance.dev/"
  echo "  curl -I https://beholder.seance.dev/"
  echo "  curl -I https://litellm.seance.dev/"
fi
