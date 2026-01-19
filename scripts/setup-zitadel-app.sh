#!/usr/bin/env bash
set -euo pipefail

# Wait for Zitadel to be ready
echo "⏳ Waiting for Zitadel to be ready..."
for i in {1..30}; do
  if curl -sf "https://auth.dev.localhost/debug/healthz" >/dev/null 2>&1; then
    echo "✅ Zitadel is ready!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ Zitadel did not become ready in time"
    exit 1
  fi
  sleep 2
done

# Check if already initialized (by checking if CLIENT_ID is in .env)
if [ -f ".env" ] && grep -q "ZITADEL_CLIENT_ID=" .env && [ -n "$(grep ZITADEL_CLIENT_ID= .env | cut -d'=' -f2)" ]; then
  echo "✅ Zitadel app already initialized, skipping setup"
  echo "   Credentials in: .env"
  exit 0
fi

# Read the PAT
if [ ! -f ".state/zitadel/pat.txt" ]; then
  echo "❌ PAT file not found at .state/zitadel/pat.txt"
  echo "   Make sure Zitadel has completed first-time initialization"
  exit 1
fi

PAT=$(cat .state/zitadel/pat.txt)
ZITADEL_URL="https://auth.dev.localhost"

echo "🔧 Setting up Zitadel project and OIDC application..."

# Create project
echo "📦 Creating project 'Seance'..."
PROJECT_RESPONSE=$(curl -sf -X POST "$ZITADEL_URL/management/v1/projects" \
  -H "Authorization: Bearer $PAT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Seance",
    "projectRoleAssertion": true,
    "projectRoleCheck": true
  }')

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Failed to create project"
  echo "Response: $PROJECT_RESPONSE"
  exit 1
fi

echo "✅ Project created with ID: $PROJECT_ID"

# Create OIDC application
echo "🔐 Creating OIDC application 'Seance Web'..."
APP_RESPONSE=$(curl -sf -X POST "$ZITADEL_URL/management/v1/projects/$PROJECT_ID/apps/oidc" \
  -H "Authorization: Bearer $PAT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Seance Web",
    "redirectUris": [
      "https://backend.dev.localhost/auth/callback",
      "https://backend.seance.dev/auth/callback"
    ],
    "postLogoutRedirectUris": [
      "https://dev.localhost",
      "https://seance.dev"
    ],
    "responseTypes": [
      "OIDC_RESPONSE_TYPE_CODE"
    ],
    "grantTypes": [
      "OIDC_GRANT_TYPE_AUTHORIZATION_CODE",
      "OIDC_GRANT_TYPE_REFRESH_TOKEN"
    ],
    "appType": "OIDC_APP_TYPE_WEB",
    "authMethodType": "OIDC_AUTH_METHOD_TYPE_BASIC",
    "version": "OIDC_VERSION_1_0",
    "devMode": false,
    "accessTokenType": "OIDC_TOKEN_TYPE_JWT",
    "accessTokenRoleAssertion": true,
    "idTokenRoleAssertion": true,
    "idTokenUserinfoAssertion": true,
    "clockSkew": "0s"
  }')

CLIENT_ID=$(echo "$APP_RESPONSE" | grep -o '"clientId":"[^"]*"' | head -1 | cut -d'"' -f4)
CLIENT_SECRET=$(echo "$APP_RESPONSE" | grep -o '"clientSecret":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "❌ Failed to create OIDC application"
  echo "Response: $APP_RESPONSE"
  exit 1
fi

echo "✅ OIDC application created!"

# Update or create .env file with credentials
# This works with secretspec's dotenv provider
if [ -f ".env" ]; then
  # Update existing .env
  if grep -q "ZITADEL_CLIENT_ID=" .env; then
    sed -i.bak "s/ZITADEL_CLIENT_ID=.*/ZITADEL_CLIENT_ID=$CLIENT_ID/" .env
  else
    echo "ZITADEL_CLIENT_ID=$CLIENT_ID" >> .env
  fi

  if grep -q "ZITADEL_CLIENT_SECRET=" .env; then
    sed -i.bak "s/ZITADEL_CLIENT_SECRET=.*/ZITADEL_CLIENT_SECRET=$CLIENT_SECRET/" .env
  else
    echo "ZITADEL_CLIENT_SECRET=$CLIENT_SECRET" >> .env
  fi

  if grep -q "VITE_ZITADEL_CLIENT_ID=" .env; then
    sed -i.bak "s/VITE_ZITADEL_CLIENT_ID=.*/VITE_ZITADEL_CLIENT_ID=$CLIENT_ID/" .env
  else
    echo "VITE_ZITADEL_CLIENT_ID=$CLIENT_ID" >> .env
  fi

  rm -f .env.bak
else
  # Create new .env file
  cat > .env <<EOF
# Zitadel OIDC Application Credentials
# Generated automatically by setup-zitadel-app.sh
# Managed by secretspec - see secretspec.toml
# DO NOT COMMIT THIS FILE

ZITADEL_CLIENT_ID=$CLIENT_ID
ZITADEL_CLIENT_SECRET=$CLIENT_SECRET
VITE_ZITADEL_CLIENT_ID=$CLIENT_ID

# Other secrets (add as needed)
# ZITADEL_MASTERKEY=MasterkeyNeedsToHave32Characters
# POSTGRES_PASSWORD=zitadel_dev_password
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# STRIPE_PRICE_ID=
EOF
fi

# Also save to backup location for reference
mkdir -p .state/zitadel
cat > .state/zitadel/app-info.txt <<EOF
Zitadel Project ID: $PROJECT_ID
Zitadel Client ID: $CLIENT_ID

The CLIENT_SECRET is stored in .env and managed by secretspec.
See secretspec.toml for secret definitions.
EOF

echo ""
echo "✅ Setup complete! Credentials saved to .env"
echo ""
echo "📋 Project Info:"
echo "   Project ID: $PROJECT_ID"
echo "   Client ID: $CLIENT_ID"
echo "   Client Secret: (stored in .env)"
echo ""
echo "🔄 Next steps:"
echo "   1. Restart devenv to load new secrets: devenv up"
echo "   2. Secrets are managed by secretspec (see secretspec.toml)"
echo "   3. Never commit .env to version control"
