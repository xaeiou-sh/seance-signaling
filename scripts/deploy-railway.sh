#!/usr/bin/env bash
set -euo pipefail

# Railway Production Deployment Script for Seance
# Usage: ./scripts/deploy-railway.sh [--skip-build]
#
# Builds Docker images and deploys to Railway via Terraform.
# Use --skip-build to deploy without rebuilding images.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
SKIP_BUILD=false
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
fi

# Get current git commit hash (short form)
GIT_COMMIT=$(git rev-parse --short HEAD)

# Build Docker images (unless skipped)
if [ "$SKIP_BUILD" = false ]; then
  echo "🚀 Building Docker images..."
  "$SCRIPT_DIR/build-images.sh" "$GIT_COMMIT"
  echo ""
else
  echo "⏭️  Skipping image build (--skip-build flag set)"
  echo "   Using existing images with tag: $GIT_COMMIT"
  echo ""
fi

# Verify required environment variables
echo "🔍 Checking required environment variables..."
MISSING_VARS=()

if [ -z "${DIGITALOCEAN_TOKEN:-}" ]; then
  MISSING_VARS+=("DIGITALOCEAN_TOKEN")
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  MISSING_VARS+=("CLOUDFLARE_API_TOKEN")
fi

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  MISSING_VARS+=("RAILWAY_TOKEN")
fi

if [ -z "${SPACES_ACCESS_KEY_ID:-}" ]; then
  MISSING_VARS+=("SPACES_ACCESS_KEY_ID")
fi

if [ -z "${SPACES_SECRET_ACCESS_KEY:-}" ]; then
  MISSING_VARS+=("SPACES_SECRET_ACCESS_KEY")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo ""
  echo "❌ Error: Missing required environment variables:"
  for var in "${MISSING_VARS[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "Set these variables before deploying:"
  echo "  export DIGITALOCEAN_TOKEN=\"...\""
  echo "  export CLOUDFLARE_API_TOKEN=\"...\""
  echo "  export RAILWAY_TOKEN=\"...\""
  echo "  export SPACES_ACCESS_KEY_ID=\"...\""
  echo "  export SPACES_SECRET_ACCESS_KEY=\"...\""
  echo ""
  echo "Tip: Get Spaces credentials from SOPS:"
  echo "  sops -d secrets/secrets.yaml | yq '.spaces'"
  exit 1
fi

echo "✅ All required environment variables set"
echo ""

# Run Terraform to create/update Railway infrastructure
echo "🚀 Deploying to Railway via Terraform..."
cd "$REPO_ROOT"
export TF_VAR_git_commit=$GIT_COMMIT
tofu init -upgrade
tofu apply -auto-approve

# Apply secrets to Railway services
echo ""
echo "🔐 Applying secrets to Railway services..."
"$REPO_ROOT/scripts/apply-railway-secrets.sh" production

# Show deployment info
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Images deployed:"
echo "  - fractalhuman1/seance-backend:$GIT_COMMIT"
echo "  - fractalhuman1/seance-landing:$GIT_COMMIT"
echo "  - fractalhuman1/seance-beholder:$GIT_COMMIT"
echo "  - fractalhuman1/seance-litellm:$GIT_COMMIT"
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
