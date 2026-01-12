#!/bin/bash

# Generate API key for CI/CD deployment authentication
# Usage: ./scripts/generate-builder-keys.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config.yml"

echo "🔐 Generating builder API key..."
echo ""

# Generate random 256-bit key (64 hex characters)
BUILDER_KEY=$(openssl rand -hex 32)

# Calculate SHA-256 hash
BUILDER_KEY_HASH=$(echo -n "$BUILDER_KEY" | shasum -a 256 | cut -d' ' -f1)

echo "✅ Key generated successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Add this hash to config.yml:"
echo "   Replace the placeholder in builder_key_hashes with:"
echo "   - \"$BUILDER_KEY_HASH\""
echo ""
echo "2. Add BUILDER_KEY to GitHub secrets:"
echo "   - Go to: https://github.com/xaeiou-sh/seance/settings/secrets/actions"
echo "   - Click 'New repository secret'"
echo "   - Name: BUILDER_KEY"
echo "   - Value: $BUILDER_KEY"
echo "   - Click 'Add secret'"
echo ""
echo "3. Keep the API key secure!"
echo "   ⚠️  Anyone with this key can deploy to your backend"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔑 Key:  $BUILDER_KEY"
echo "🔒 Hash: $BUILDER_KEY_HASH"
echo ""
