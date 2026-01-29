#!/usr/bin/env bash
set -euo pipefail

# Decrypt secrets and export as environment variables
# Usage: source ./scripts/decrypt-secrets.sh

# Get script directory (works in both bash and zsh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_FILE="$REPO_ROOT/secrets/secrets.yaml"
# macOS default location for SOPS age keys
AGE_KEY_FILE="${HOME}/Library/Application Support/sops/age/keys.txt"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: Secrets file not found: $SECRETS_FILE" >&2
  exit 1
fi

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

if [ ! -f "$AGE_KEY_FILE" ]; then
  echo "Error: Age key not found: $AGE_KEY_FILE" >&2
  echo "Copy your age key to $AGE_KEY_FILE" >&2
  exit 1
fi

echo "🔓 Decrypting secrets from $SECRETS_FILE..." >&2

# Set age key location
export SOPS_AGE_KEY_FILE="$AGE_KEY_FILE"

# Decrypt and export all secrets as environment variables
# Iterates through all top-level keys (stripe, litellm, etc.) and their nested keys
while IFS='=' read -r key value; do
  if [[ -n "$key" ]] && [[ -n "$value" ]]; then
    export "$key"="$value"
  fi
done < <(sops -d "$SECRETS_FILE" | yq eval '.[] | to_entries | .[] | .key + "=" + .value' -)

echo "✓ Secrets loaded" >&2
