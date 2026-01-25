#!/usr/bin/env bash
set -euo pipefail

# Apply secrets to Kubernetes cluster from SOPS-encrypted file
# Usage: ./scripts/apply-secrets.sh [namespace]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_FILE="$REPO_ROOT/secrets/secrets.yaml"
NAMESPACE="${1:-seance-prod}"

echo "🔐 Applying secrets to Kubernetes namespace: $NAMESPACE"

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
REQUIRED_SECRETS=("STRIPE_SECRET_KEY" "STRIPE_PRICE_ID")
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
