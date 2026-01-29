#!/usr/bin/env bash
set -euo pipefail

# Apply secrets from SOPS to Railway services
# Usage: ./scripts/apply-railway-secrets.sh <environment>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default to production environment
ENVIRONMENT="${1:-production}"

echo "📦 Loading secrets for Railway environment: $ENVIRONMENT"

# Check Railway CLI is available
if ! command -v railway &> /dev/null; then
  echo "Error: Railway CLI not found"
  echo "Install with: brew install railway"
  exit 1
fi

# Check SOPS is available
if ! command -v sops &> /dev/null; then
  echo "Error: SOPS not found"
  echo "Install with: brew install sops"
  exit 1
fi

# Decrypt secrets from SOPS
SECRETS_FILE="$REPO_ROOT/secrets/secrets.yaml"
if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: Secrets file not found: $SECRETS_FILE"
  exit 1
fi

echo "🔓 Decrypting secrets from SOPS..."
DECRYPTED=$(sops -d "$SECRETS_FILE")

# Parse secrets using yq (or Python if yq not available)
if command -v yq &> /dev/null; then
  # Extract secrets using yq
  STRIPE_SECRET_KEY=$(echo "$DECRYPTED" | yq -r '.stripe.STRIPE_SECRET_KEY')
  STRIPE_PRICE_ID=$(echo "$DECRYPTED" | yq -r '.stripe.STRIPE_PRICE_ID')
  LITELLM_MASTER_KEY=$(echo "$DECRYPTED" | yq -r '.litellm.LITELLM_MASTER_KEY')
  DEEPINFRA_API_KEY=$(echo "$DECRYPTED" | yq -r '.litellm.DEEPINFRA_API_KEY // ""')
  ANTHROPIC_API_KEY=$(echo "$DECRYPTED" | yq -r '.litellm.ANTHROPIC_API_KEY // ""')
  OPENROUTER_API_KEY=$(echo "$DECRYPTED" | yq -r '.litellm.OPENROUTER_API_KEY // ""')

  # Check for both 'spaces' and 'digital_ocean_spaces' naming
  if echo "$DECRYPTED" | yq -e '.spaces' > /dev/null 2>&1; then
    SPACES_ACCESS_KEY_ID=$(echo "$DECRYPTED" | yq -r '.spaces.SPACES_ACCESS_KEY_ID')
    SPACES_SECRET_ACCESS_KEY=$(echo "$DECRYPTED" | yq -r '.spaces.SPACES_SECRET_ACCESS_KEY')
  elif echo "$DECRYPTED" | yq -e '.digital_ocean_spaces' > /dev/null 2>&1; then
    SPACES_ACCESS_KEY_ID=$(echo "$DECRYPTED" | yq -r '.digital_ocean_spaces.SPACES_ACCESS_KEY_ID')
    SPACES_SECRET_ACCESS_KEY=$(echo "$DECRYPTED" | yq -r '.digital_ocean_spaces.SPACES_SECRET_ACCESS_KEY')
  else
    echo "Error: No spaces configuration found in secrets"
    exit 1
  fi
else
  echo "Error: yq not found - required for parsing YAML"
  echo "Install with: brew install yq"
  exit 1
fi

# Validate required secrets
if [ -z "$STRIPE_SECRET_KEY" ] || [ "$STRIPE_SECRET_KEY" = "null" ]; then
  echo "Error: STRIPE_SECRET_KEY not found in secrets"
  exit 1
fi

if [ -z "$SPACES_ACCESS_KEY_ID" ] || [ "$SPACES_ACCESS_KEY_ID" = "null" ]; then
  echo "Error: SPACES_ACCESS_KEY_ID not found in secrets"
  exit 1
fi

# Get Spaces metadata from Terraform outputs
echo "📊 Reading Terraform outputs..."
cd "$REPO_ROOT"

SPACES_BUCKET=$(tofu output -raw spaces_bucket_name 2>/dev/null || echo "seance-cdn")
SPACES_REGION="sfo3"
SPACES_ENDPOINT=$(tofu output -raw spaces_endpoint 2>/dev/null)
SPACES_CDN_ENDPOINT=$(tofu output -raw spaces_cdn_endpoint 2>/dev/null)

# Path prefix based on environment (prod or dev)
if [ "$ENVIRONMENT" = "production" ]; then
  SPACES_PATH_PREFIX="prod"
else
  SPACES_PATH_PREFIX="dev"
fi

echo "🔧 Applying secrets to Railway services..."

# Link to Railway project (assumes you've already linked via 'railway link')
# If not linked, run: railway link

# Apply secrets to backend service
echo "  → Backend service"
railway variables --service backend set \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_PRICE_ID="$STRIPE_PRICE_ID" \
  SPACES_ACCESS_KEY_ID="$SPACES_ACCESS_KEY_ID" \
  SPACES_SECRET_ACCESS_KEY="$SPACES_SECRET_ACCESS_KEY" \
  SPACES_BUCKET="$SPACES_BUCKET" \
  SPACES_REGION="$SPACES_REGION" \
  SPACES_ENDPOINT="$SPACES_ENDPOINT" \
  SPACES_CDN_ENDPOINT="$SPACES_CDN_ENDPOINT" \
  SPACES_PATH_PREFIX="$SPACES_PATH_PREFIX"

# Apply LiteLLM secrets
echo "  → LiteLLM service"
railway variables --service litellm set \
  LITELLM_MASTER_KEY="$LITELLM_MASTER_KEY"

# Add optional API keys if they exist
if [ -n "$DEEPINFRA_API_KEY" ] && [ "$DEEPINFRA_API_KEY" != "null" ]; then
  railway variables --service litellm set DEEPINFRA_API_KEY="$DEEPINFRA_API_KEY"
fi

if [ -n "$ANTHROPIC_API_KEY" ] && [ "$ANTHROPIC_API_KEY" != "null" ]; then
  railway variables --service litellm set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
fi

if [ -n "$OPENROUTER_API_KEY" ] && [ "$OPENROUTER_API_KEY" != "null" ]; then
  railway variables --service litellm set OPENROUTER_API_KEY="$OPENROUTER_API_KEY"
fi

echo ""
echo "✅ Secrets applied successfully!"
echo ""
echo "Services will automatically redeploy with new environment variables."
echo "Monitor deployment status with: railway status"
