# Spaces Migration Deployment Guide

This guide outlines the steps required to complete the migration to DigitalOcean Spaces.

## Architecture Overview

### What Changed

**Before:**
- Backend writes to container filesystem (`./releases/`, `./web/`)
- Files lost on pod restart
- Backend serves large files (100-300MB .dmg) through Node.js
- Cannot scale horizontally (filesystem state)

**After:**
- Backend uploads to DigitalOcean Spaces during `/deploy`
- Files persist indefinitely in object storage
- CDN serves files directly (bypasses backend)
- Fully stateless backend (can scale to 3+ replicas)

### Secrets Management

All secrets managed in one place (SOPS):

```yaml
# secrets/secrets.yaml (encrypted with SOPS)
stripe:
  STRIPE_SECRET_KEY: sk_live_...
  STRIPE_PRICE_ID: price_...

litellm:
  LITELLM_MASTER_KEY: sk-...
  ANTHROPIC_API_KEY: sk-ant-...

spaces:
  SPACES_ACCESS_KEY_ID: DO00...      # From DigitalOcean console
  SPACES_SECRET_ACCESS_KEY: secret   # From DigitalOcean console
```

**Metadata (bucket, region, endpoints) is computed automatically from Terraform outputs!**

### Deployment Flow

```
k8s-deploy →
  ├── tofu apply (creates bucket + CORS)
  └── apply-secrets.sh:
      ├── Decrypt SOPS (get credentials)
      ├── Read Terraform outputs (get metadata)
      └── Create Kubernetes secret (credentials + metadata)
```

## Prerequisites (One-Time Setup)

### Create Spaces Access Keys

1. Navigate to DigitalOcean Console: **API** → **Spaces Keys**
2. Click **Generate New Key**
3. Name it: `seance-backend-prod`
4. **Save the Access Key ID and Secret** (shown only once)

### Add to SOPS Secrets

Edit the encrypted secrets file:

```bash
sops secrets/secrets.yaml
```

Add the `spaces` section:

```yaml
spaces:
  SPACES_ACCESS_KEY_ID: "DO00ABCD1234..."  # From step 1
  SPACES_SECRET_ACCESS_KEY: "secret_here"  # From step 1
```

Save and exit. SOPS will automatically re-encrypt the file.

**That's it!** The metadata (bucket name, region, endpoints, path prefix) is computed automatically.

## Deployment

Just run:

```bash
k8s-deploy
```

This will:
1. ✅ Build Docker images (backend + landing)
2. ✅ Regenerate Kubernetes manifests
3. ✅ Run `tofu apply`:
   - Creates Spaces bucket (`seance-cdn`)
   - Configures CORS for CDN access
   - Outputs bucket metadata
4. ✅ Run `apply-secrets.sh`:
   - Decrypts SOPS to get credentials
   - Reads Terraform outputs for metadata
   - Creates Kubernetes secret with all 7 env vars

## What Gets Created

### Terraform Resources

```hcl
digitalocean_spaces_bucket.seance_cdn
  name   = "seance-cdn"
  region = "sfo3"

digitalocean_spaces_bucket_cors_configuration.seance_cdn
  allowed_methods = ["GET", "HEAD"]
  allowed_origins = ["*"]
```

### Kubernetes Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: seance-secrets
  namespace: seance-prod
data:
  # From SOPS
  STRIPE_SECRET_KEY: <encrypted>
  STRIPE_PRICE_ID: <encrypted>
  LITELLM_MASTER_KEY: <encrypted>
  SPACES_ACCESS_KEY_ID: <encrypted>
  SPACES_SECRET_ACCESS_KEY: <encrypted>

  # Computed from Terraform outputs
  SPACES_BUCKET: seance-cdn
  SPACES_REGION: sfo3
  SPACES_ENDPOINT: https://sfo3.digitaloceanspaces.com
  SPACES_CDN_ENDPOINT: https://seance-cdn.sfo3.cdn.digitaloceanspaces.com
  SPACES_PATH_PREFIX: prod
```

## Verification

### 1. Check Deployment

```bash
export KUBECONFIG=/Users/nicole/Documents/seance-signaling/.kube/config
kubectl get pods -n seance-prod
```

All pods should be `Running` with `1/1 Ready`.

### 2. Check Backend Logs

```bash
kubectl logs -n seance-prod -l app=backend --tail=50
```

You should see:
```
[Spaces] Initialized - bucket: seance-cdn, prefix: prod
```

### 3. Test Health Endpoint

```bash
curl https://backend.seance.dev/
```

Expected:
```json
{"status":"healthy","service":"seance-backend","timestamp":"2026-01-27T..."}
```

### 4. Test File Upload

```bash
echo "Test $(date)" | base64 > /tmp/test.b64

curl -X POST https://backend.seance.dev/deploy \
  -H "Content-Type: application/json" \
  -H "X-Builder-Key: $BUILDER_KEY" \
  -d "{\"files\":[{\"path\":\"releases/test.txt\",\"content\":\"$(cat /tmp/test.b64)\"}]}"
```

Expected response includes CDN URL:
```json
{
  "success": true,
  "files": [{
    "url": "https://seance-cdn.sfo3.cdn.digitaloceanspaces.com/prod/releases/test.txt"
  }]
}
```

Download from CDN:
```bash
curl https://seance-cdn.sfo3.cdn.digitaloceanspaces.com/prod/releases/test.txt
```

### 5. Verify Update Endpoints

```bash
curl https://backend.seance.dev/updates/api/version.json
curl https://backend.seance.dev/updates/darwin-arm64/latest-mac.yml
```

Both should return data from Spaces.

### 6. Scale Test

```bash
kubectl scale deployment/backend --replicas=3 -n seance-prod
kubectl get pods -n seance-prod -l app=backend
```

All 3 pods should be `Running` and `1/1 Ready`.

## Bucket Structure

```
seance-cdn/
├── prod/
│   ├── releases/
│   │   ├── version.json
│   │   └── darwin-arm64/
│   │       ├── latest-mac.yml
│   │       └── Seance-*.dmg
│   └── web/
│       └── (future: web app assets)
└── dev/
    └── (same structure for development)
```

The `prod` vs `dev` prefix is set automatically based on environment.

## Troubleshooting

### "Missing required secret: SPACES_ACCESS_KEY_ID"

**Cause:** Spaces credentials not added to SOPS

**Solution:**
```bash
sops secrets/secrets.yaml
# Add spaces: section with credentials
```

### Backend fails to start

Check logs:
```bash
kubectl logs -n seance-prod -l app=backend
```

Common issues:
- `SPACES_ACCESS_KEY_ID is required` → Check SOPS has spaces section
- `Failed to upload` → Invalid credentials

### Files not accessible via CDN

1. Check bucket exists:
```bash
tofu state show digitalocean_spaces_bucket.seance_cdn
```

2. Test direct Spaces endpoint:
```bash
curl https://sfo3.digitaloceanspaces.com/seance-cdn/prod/releases/test.txt
```

### Key Rotation

If credentials are compromised:

1. Generate new key in DigitalOcean console
2. Update SOPS:
```bash
sops secrets/secrets.yaml
# Update SPACES_ACCESS_KEY_ID and SPACES_SECRET_ACCESS_KEY
```
3. Redeploy:
```bash
k8s-deploy
```

Downtime: ~30 seconds (rolling update)

## Benefits Summary

- ✅ **Horizontal scaling** - Backend is stateless, can run 3+ replicas
- ✅ **Performance** - CDN serves files at edge locations
- ✅ **Reliability** - Files persist across pod restarts
- ✅ **Consistency** - All secrets in one place (SOPS)
- ✅ **Automation** - Metadata computed from infrastructure
- ✅ **Cost efficiency** - Only +$5/month for Spaces
- ✅ **Code simplification** - Removed 150+ lines of file-serving code

## Design Principles

**Single Source of Truth:**
- Credentials in SOPS (single encrypted file)
- Infrastructure metadata in Terraform (computed from resources)
- No duplication, no manual sync

**Separation of Concerns:**
- **SOPS:** Sensitive credentials (Stripe, Spaces, API keys)
- **Terraform:** Infrastructure (buckets, CORS, DNS)
- **apply-secrets.sh:** Bridge (combines credentials + metadata)

**Zero Manual Steps:**
- Create Spaces keys once → Add to SOPS → Done
- All metadata computed automatically from Terraform
- `k8s-deploy` handles everything
