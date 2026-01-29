#!/bin/bash
# Test script for LiteLLM model configuration
# Tests the seance-oss-large and seance-oss-medium models

set -e

if [ -z "$LITELLM_MASTER_KEY" ]; then
  echo "Error: LITELLM_MASTER_KEY environment variable not set"
  echo "Get it from: sops -d secrets/secrets.yaml | grep LITELLM_MASTER_KEY"
  exit 1
fi

# Determine environment
if [ "$1" == "prod" ]; then
  BASE_URL="https://litellm.seance.dev"
elif [ "$1" == "local" ]; then
  BASE_URL="https://litellm.local.localhost"
else
  BASE_URL="https://litellm.dev.localhost"
fi

echo "Testing LiteLLM models at $BASE_URL"
echo "=========================================="

# Test seance-oss-large (MiniMax-M2)
echo ""
echo "Testing seance-oss-large (MiniMax-M2)..."
curl -k -s "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -d '{
    "model": "seance-oss-large",
    "messages": [{"role": "user", "content": "Say hello in exactly 5 words."}],
    "max_tokens": 50
  }' | jq -r '.choices[0].message.content // .error'

# Test seance-oss-medium (gpt-oss-120b)
echo ""
echo "Testing seance-oss-medium (gpt-oss-120b)..."
curl -k -s "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -d '{
    "model": "seance-oss-medium",
    "messages": [{"role": "user", "content": "Say hello in exactly 5 words."}],
    "max_tokens": 50
  }' | jq -r '.choices[0].message.content // .error'

# Test health endpoint
echo ""
echo "Testing health endpoint..."
curl -k -s "$BASE_URL/health" | jq '.'

echo ""
echo "=========================================="
echo "Tests complete!"
