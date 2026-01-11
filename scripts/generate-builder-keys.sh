#!/bin/bash

# Generate Ed25519 keypair for CI/CD deployment signing
# Usage: ./scripts/generate-builder-keys.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_DIR="${SCRIPT_DIR}/../.keys"

echo "🔐 Generating Ed25519 keypair for builder authentication..."
echo ""

# Create keys directory if it doesn't exist
mkdir -p "${KEYS_DIR}"

# Check if keys already exist
if [ -f "${KEYS_DIR}/builder_key" ]; then
  echo "⚠️  Keys already exist at ${KEYS_DIR}/builder_key"
  echo ""
  read -p "Overwrite existing keys? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
  fi
  rm -f "${KEYS_DIR}/builder_key" "${KEYS_DIR}/builder_key.pub"
fi

# Generate Ed25519 keypair in PEM format
ssh-keygen -t ed25519 -m PEM -f "${KEYS_DIR}/builder_key" -N "" -C "seance-builder"

echo ""
echo "✅ Keys generated successfully!"
echo ""
echo "📁 Private key: ${KEYS_DIR}/builder_key"
echo "📁 Public key:  ${KEYS_DIR}/builder_key.pub"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Add BUILDER_PUBLIC_KEY to backend .env:"
echo "   cd seance-backend-hono"
echo "   echo 'BUILDER_PUBLIC_KEY=\"$(cat ${KEYS_DIR}/builder_key.pub)\"' >> .env"
echo ""
echo "2. Add BUILDER_PRIVATE_KEY to GitHub secrets:"
echo "   - Go to: https://github.com/xaeiou-sh/seance/settings/secrets/actions"
echo "   - Click 'New repository secret'"
echo "   - Name: BUILDER_PRIVATE_KEY"
echo "   - Value: Copy the entire contents of ${KEYS_DIR}/builder_key"
echo "   - Click 'Add secret'"
echo ""
echo "3. Keep the private key secure and backed up!"
echo "   ⚠️  Anyone with the private key can deploy to your backend"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔍 Key fingerprint:"
ssh-keygen -l -f "${KEYS_DIR}/builder_key.pub"
echo ""
