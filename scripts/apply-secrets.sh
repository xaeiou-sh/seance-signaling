#!/usr/bin/env bash
set -euo pipefail

# Apply secrets to Kubernetes cluster from SOPS-encrypted file
# Usage: ./scripts/apply-secrets.sh [namespace]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_FILE="$REPO_ROOT/secrets/secrets.yaml"
NAMESPACE="${1:-seance-prod}"
ENVIRONMENT="${2:-prod}"

echo "🔐 Applying secrets to Kubernetes namespace: $NAMESPACE (environment: $ENVIRONMENT)"

# Check dependencies
if ! command -v sops &> /dev/null; then
  echo "Error: sops is not installed" >&2
  echo "Install with: nix-env -iA nixpkgs.sops" >&2
  exit 1
fi

if ! command -v yq &> /dev/null; then
  echo "Error: yq is not installed" >&2
  echo "Install with: nix-env -iA nixpkgs.yq-go" >&2
  exit 1
fi

if ! command -v kubectl &> /dev/null; then
  echo "Error: kubectl is not installed" >&2
  exit 1
fi

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: Secrets file not found: $SECRETS_FILE" >&2
  exit 1
fi

# Decrypt secrets
echo "🔓 Decrypting secrets..."
DECRYPTED=$(sops -d "$SECRETS_FILE")

# Extract all key-value pairs using yq
# Iterates through all top-level keys (stripe, litellm, etc.) and their nested keys
# Output format: ENV_VAR_NAME=value
declare -A SECRETS
while IFS='=' read -r key value; do
  if [[ -n "$key" ]] && [[ -n "$value" ]]; then
    SECRETS["$key"]="$value"
  fi
done < <(echo "$DECRYPTED" | yq eval '.[] | to_entries | .[] | .key + "=" + .value' -)

if [ ${#SECRETS[@]} -eq 0 ]; then
  echo "Error: No secrets found in file" >&2
  exit 1
fi

# Verify required secrets exist
REQUIRED_SECRETS=("STRIPE_SECRET_KEY" "STRIPE_PRICE_ID" "SPACES_ACCESS_KEY_ID" "SPACES_SECRET_ACCESS_KEY")
for required in "${REQUIRED_SECRETS[@]}"; do
  if [[ -z "${SECRETS[$required]:-}" ]]; then
    echo "Error: Required secret missing: $required" >&2
    exit 1
  fi
done

# Add default LITELLM_MASTER_KEY if not present (for dev mode)
if [[ -z "${SECRETS[LITELLM_MASTER_KEY]:-}" ]]; then
  echo "⚠️  LITELLM_MASTER_KEY not found, using dummy value for dev" >&2
  SECRETS[LITELLM_MASTER_KEY]="sk-1234-dummy-dev-key-replace-in-production"
fi

# Add Spaces metadata from Terraform outputs
echo "📦 Fetching Spaces metadata from Terraform..."
cd "$REPO_ROOT"

# Check if tofu/terraform is available
if command -v tofu &> /dev/null; then
  TF_CMD="tofu"
elif command -v terraform &> /dev/null; then
  TF_CMD="terraform"
else
  echo "Error: Neither tofu nor terraform found" >&2
  exit 1
fi

# Get Terraform outputs
SPACES_BUCKET=$($TF_CMD output -raw spaces_bucket_name 2>/dev/null || echo "")
SPACES_REGION=$($TF_CMD output -raw spaces_endpoint 2>/dev/null | sed -n 's|https://\([^.]*\).*|\1|p' || echo "sfo3")
SPACES_ENDPOINT=$($TF_CMD output -raw spaces_endpoint 2>/dev/null || echo "https://sfo3.digitaloceanspaces.com")
SPACES_CDN_ENDPOINT=$($TF_CMD output -raw spaces_cdn_endpoint 2>/dev/null || echo "")

# Fallback if Terraform outputs not available yet
if [[ -z "$SPACES_BUCKET" ]]; then
  echo "⚠️  Spaces bucket not found in Terraform state, using default: seance-cdn" >&2
  SPACES_BUCKET="seance-cdn"
fi

if [[ -z "$SPACES_CDN_ENDPOINT" ]]; then
  echo "⚠️  Computing CDN endpoint from bucket name" >&2
  SPACES_CDN_ENDPOINT="https://${SPACES_BUCKET}.${SPACES_REGION}.cdn.digitaloceanspaces.com"
fi

# Add Spaces metadata to secrets
SECRETS[SPACES_BUCKET]="$SPACES_BUCKET"
SECRETS[SPACES_REGION]="$SPACES_REGION"
SECRETS[SPACES_ENDPOINT]="$SPACES_ENDPOINT"
SECRETS[SPACES_CDN_ENDPOINT]="$SPACES_CDN_ENDPOINT"
SECRETS[SPACES_PATH_PREFIX]="$ENVIRONMENT"

echo "  ✓ SPACES_BUCKET: $SPACES_BUCKET"
echo "  ✓ SPACES_REGION: $SPACES_REGION"
echo "  ✓ SPACES_ENDPOINT: $SPACES_ENDPOINT"
echo "  ✓ SPACES_CDN_ENDPOINT: $SPACES_CDN_ENDPOINT"
echo "  ✓ SPACES_PATH_PREFIX: $ENVIRONMENT"

# Build kubectl arguments from all secrets
echo "📝 Creating/updating Kubernetes secret with ${#SECRETS[@]} keys..."
SECRET_ARGS=()
for key in "${!SECRETS[@]}"; do
  SECRET_ARGS+=(--from-literal="${key}=${SECRETS[$key]}")
  echo "  ✓ $key"
done

# Create or update Kubernetes secret
kubectl create secret generic seance-secrets \
  "${SECRET_ARGS[@]}" \
  --namespace="$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secrets applied successfully to namespace: $NAMESPACE"
