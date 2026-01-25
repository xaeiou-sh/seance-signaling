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

if [ ! -f "$AGE_KEY_FILE" ]; then
  echo "Error: Age key not found: $AGE_KEY_FILE" >&2
  echo "Copy your age key to $AGE_KEY_FILE" >&2
  exit 1
fi

echo "🔓 Decrypting secrets from $SECRETS_FILE..." >&2

# Set age key location and decrypt secrets
export SOPS_AGE_KEY_FILE="$AGE_KEY_FILE"

# Decrypt and export as environment variables
# Parse YAML key: value format and convert to KEY=value for export
eval "$(sops -d "$SECRETS_FILE" | grep -v '^#' | sed 's/: /=/' | sed 's/^/export /')"

echo "✓ Secrets loaded" >&2
