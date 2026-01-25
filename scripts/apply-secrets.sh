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
STRIPE_SECRET_KEY=$(sops -d "$SECRETS_FILE" | grep "STRIPE_SECRET_KEY:" | cut -d':' -f2- | xargs)
STRIPE_PRICE_ID=$(sops -d "$SECRETS_FILE" | grep "STRIPE_PRICE_ID:" | cut -d':' -f2- | xargs)

if [ -z "$STRIPE_SECRET_KEY" ] || [ -z "$STRIPE_PRICE_ID" ]; then
  echo "Error: Failed to decrypt secrets" >&2
  exit 1
fi

# Create or update Kubernetes secret
echo "📝 Creating/updating Kubernetes secret..."
kubectl create secret generic seance-secrets \
  --from-literal=STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  --from-literal=STRIPE_PRICE_ID="$STRIPE_PRICE_ID" \
  --namespace="$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secrets applied successfully to namespace: $NAMESPACE"
