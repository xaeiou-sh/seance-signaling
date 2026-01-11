# Quick Setup Guide

Follow these steps to get the simplified CI/CD system running.

## Step 1: Verify Configuration

The repo already has `config.yml` with a builder public key committed:

```bash
cd /Users/nicole/Documents/seance-signaling
cat config.yml
```

You should see:
```yaml
builder_keys:
  - ssh-ed25519 AAAAC3... seance-builder
```

This public key is **safe to commit** - it can't be used to impersonate the builder.

## Step 2: Start Backend

No configuration needed - the backend reads from `config.yml` automatically:

```bash
cd /Users/nicole/Documents/seance-signaling
devenv up
```

Backend will log: `[Config] Loaded 1 builder key(s)`

## Step 3: Configure GitHub Secret

Only one secret needed - the private key:

Go to: https://github.com/xaeiou-sh/seance/settings/secrets/actions

Add `BUILDER_PRIVATE_KEY`:
- Open `/Users/nicole/Documents/seance-signaling/.keys/builder_key`
- Copy the ENTIRE contents (including `-----BEGIN OPENSSH PRIVATE KEY-----` headers)
- Paste as the secret value

Also add `DEPLOY_URL`:
- Value: `https://backend.seance.dev/deploy`

## Step 4: Verify Services

Check that services are accessible:
- Backend: https://backend.seance.dev
- Deploy endpoint: https://backend.seance.dev/deploy
- Web app: https://app.seance.dev

## Step 5: Test Deployment

### Option A: Manual Trigger

1. Go to https://github.com/xaeiou-sh/seance/actions
2. Click "Build and Deploy"
3. Click "Run workflow" → Select branch → "Run workflow"
4. Watch the build (takes ~10-15 minutes)

### Option B: Push to Trigger

```bash
cd /Users/nicole/Documents/seance
git checkout main
echo "# Test" >> README.md
git commit -am "test: trigger deployment"
git push
```

## Step 6: Verify Deployment

After the build completes:

```bash
# Check version API
curl https://backend.seance.dev/updates/api/version.json | jq

# Check web app
open https://app.seance.dev

# Check desktop update manifest
curl https://backend.seance.dev/updates/darwin-arm64/latest-mac.yml
```

## Troubleshooting

### "No builder_keys found in config.yml" on backend startup
- Check that `config.yml` exists at repo root
- Verify `builder_keys:` section has at least one key
- Restart `devenv up`

### "Invalid signature" in GitHub Actions
- Verify `BUILDER_PRIVATE_KEY` secret is set in GitHub
- Check that you copied the entire private key (including header/footer)
- Ensure the public key in `config.yml` matches the private key in GitHub
- Test locally: Run `./scripts/generate-builder-keys.sh` and compare fingerprints

### "Connection refused" in GitHub Actions
- Check that `devenv up` is running
- Test: `curl https://backend.seance.dev`

### Build succeeds but files not deployed
- Check backend logs in the terminal running `devenv up`
- Look for `[Deploy]` messages

## What Changed from Before

**Removed:**
- ❌ Self-hosted GitHub Actions runner on spare Mac
- ❌ Local file copying from runner to backend
- ❌ Runner maintenance and setup
- ❌ Bearer token authentication (less secure)
- ❌ .env files and environment variable complexity

**Added:**
- ✅ GitHub-hosted runners (macos-14)
- ✅ `/deploy` API endpoint on backend
- ✅ HTTPS POST deployment from Actions to backend
- ✅ Ed25519 signature authentication (cryptographically secure)
- ✅ Single `config.yml` for all configuration (public keys committed!)

**Kept:**
- ✅ Cloudflare Tunnel (still works great!)
- ✅ Desktop auto-updates
- ✅ Web app hosting
- ✅ Local development workflow

**Security Improvements:**
- Backend only stores public key in version control (safe to commit)
- GitHub Actions signs each deployment with private key
- Signatures can be verified later for audit trail
- Multiple builder keys supported for key rotation without downtime
- No secrets in .env files

## Migration to Self-Hosting (Future)

When ready to self-host:

1. Set up your server (VPS, dedicated, etc.)
2. Deploy `seance-backend-hono` to server
3. Update `DEPLOY_URL` secret to point to server
4. Done! (Optionally add self-hosted runner for faster builds)

The API-based deployment makes migration easy.
