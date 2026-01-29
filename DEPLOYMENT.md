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

### Infrastructure Management

```
Terraform manages:
  ├── Spaces bucket (seance-cdn)
  ├── CORS configuration
  └── Kubernetes secret (spaces-credentials) with:
      ├── Access credentials (from terraform.tfvars)
      └── Derived metadata (bucket, region, endpoints)

SOPS manages:
  ├── Stripe credentials
  └── LiteLLM API keys
```

### Deployment Flow

```
GitHub Actions → POST /deploy → Backend uploads to Spaces → CDN serves files
```

## Prerequisites (One-Time Setup)

### 1. Create Spaces Access Keys

Navigate to DigitalOcean Console:
1. Go to **API** → **Spaces Keys**
2. Click **Generate New Key**
3. Name it: `seance-backend-prod`
4. **Save the Access Key ID and Secret** (shown only once)

### 2. Add Credentials to Terraform

Edit `terraform.tfvars`:

```bash
nvim terraform.tfvars
```

Replace the placeholder values:

```hcl
spaces_access_key_id     = "DO00ABCD1234..."  # From step 1
spaces_secret_access_key = "secret_key_here"   # From step 1
```

**Important:** This file is in `.gitignore` - never commit it to git!

## Deployment (via k8s-deploy)

Once the prerequisites are complete, just run:

```bash
k8s-deploy
```

This script (`scripts/deploy-production.sh`) will:

1. ✅ Build Docker images (backend + landing)
2. ✅ Regenerate Kubernetes manifests
3. ✅ Run `tofu apply` which:
   - Creates Spaces bucket (seance-cdn)
   - Creates CORS configuration
   - Creates Kubernetes secret with credentials + metadata
   - Applies all manifests
4. ✅ Apply SOPS secrets (Stripe, LiteLLM)

**No manual steps required after initial setup!**

## What Terraform Creates

### 1. Spaces Bucket

```hcl
resource "digitalocean_spaces_bucket" "seance_cdn"
  name   = "seance-cdn"
  region = "sfo3"
```

### 2. CORS Configuration

```hcl
resource "digitalocean_spaces_bucket_cors_configuration" "seance_cdn"
  allowed_methods = ["GET", "HEAD"]
  allowed_origins = ["*"]
```

### 3. Kubernetes Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: spaces-credentials
  namespace: seance-prod
data:
  SPACES_ACCESS_KEY_ID: <from terraform.tfvars>
  SPACES_SECRET_ACCESS_KEY: <from terraform.tfvars>
  SPACES_BUCKET: seance-cdn
  SPACES_REGION: sfo3
  SPACES_ENDPOINT: https://sfo3.digitaloceanspaces.com
  SPACES_CDN_ENDPOINT: https://seance-cdn.sfo3.cdn.digitaloceanspaces.com
  SPACES_PATH_PREFIX: prod
```

**Key Point:** All metadata (bucket, region, endpoints) is derived from Terraform resources. Only the access keys come from `terraform.tfvars`.

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

Expected response:
```json
{"status":"healthy","service":"seance-backend","timestamp":"2026-01-27T..."}
```

### 4. Test File Upload

Create test file:

```bash
echo "Test $(date)" | base64 > /tmp/test.b64
```

Deploy via API:

```bash
curl -X POST https://backend.seance.dev/deploy \
  -H "Content-Type: application/json" \
  -H "X-Builder-Key: $BUILDER_KEY" \
  -d "{\"files\":[{\"path\":\"releases/test.txt\",\"content\":\"$(cat /tmp/test.b64)\"}]}"
```

Expected response includes CDN URL:
```json
{
  "success": true,
  "filesDeployed": 1,
  "files": [{
    "path": "releases/test.txt",
    "url": "https://seance-cdn.sfo3.cdn.digitaloceanspaces.com/prod/releases/test.txt",
    "size": 123
  }]
}
```

Download from CDN:

```bash
curl https://seance-cdn.sfo3.cdn.digitaloceanspaces.com/prod/releases/test.txt
```

### 5. Verify Endpoints

```bash
# Version API (fetches from Spaces)
curl https://backend.seance.dev/updates/api/version.json

# Update manifest (for desktop app)
curl https://backend.seance.dev/updates/darwin-arm64/latest-mac.yml
```

Both should return data (not 404).

### 6. Scale Test

Verify stateless operation:

```bash
kubectl scale deployment/backend --replicas=3 -n seance-prod
kubectl get pods -n seance-prod -l app=backend
```

All 3 pods should show `Running` and `1/1 Ready`.

Test upload with multiple replicas:

```bash
for i in {1..5}; do
  echo "Test $i" | base64 | curl -X POST https://backend.seance.dev/deploy \
    -H "Content-Type: application/json" \
    -H "X-Builder-Key: $BUILDER_KEY" \
    -d "{\"files\":[{\"path\":\"test/file$i.txt\",\"content\":\"$(cat -)\"}]}"
done
```

All uploads should succeed regardless of which pod handles the request.

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

## Rollback Plan

If deployment fails:

```bash
# Revert backend image
kubectl set image deployment/backend \
  backend=fractalhuman1/seance-backend:PREVIOUS_TAG \
  -n seance-prod

# Verify rollback
kubectl rollout status deployment/backend -n seance-prod

# Check health
curl https://backend.seance.dev/
```

Recovery time: ~2 minutes (Kubernetes rolling update)

## Troubleshooting

### "Missing required variable"

**Error:**
```
Error: No value for required variable
  on main.tf line X, in variable "spaces_access_key_id":
```

**Solution:** Add credentials to `terraform.tfvars` (see Prerequisites)

### Backend fails to start

Check logs:
```bash
kubectl logs -n seance-prod -l app=backend
```

Common issues:
- `SPACES_ACCESS_KEY_ID is required` → Terraform secret not created
- `Failed to upload` → Invalid credentials or bucket permissions

### Files not accessible via CDN

1. Check bucket exists:
```bash
tofu state show digitalocean_spaces_bucket.seance_cdn
```

2. Verify CORS configuration:
```bash
tofu state show digitalocean_spaces_bucket_cors_configuration.seance_cdn
```

3. Test direct Spaces endpoint (bypassing CDN):
```bash
curl https://sfo3.digitaloceanspaces.com/seance-cdn/prod/releases/test.txt
```

### Key Rotation

If credentials are compromised:

1. Generate new key in DigitalOcean console
2. Update `terraform.tfvars` with new credentials
3. Apply changes:
```bash
tofu apply
```
4. Restart backend:
```bash
kubectl rollout restart deployment/backend -n seance-prod
```

Downtime: ~30 seconds (rolling update)

## Benefits Summary

- ✅ **Horizontal scaling** - Backend is stateless, can run 3+ replicas
- ✅ **Performance** - CDN serves files at edge locations
- ✅ **Reliability** - Files persist across pod restarts
- ✅ **Automation** - Integrated into k8s-deploy workflow
- ✅ **Infrastructure as code** - Metadata managed by Terraform
- ✅ **Cost efficiency** - Only +$5/month for Spaces
- ✅ **Code simplification** - Removed 150+ lines of file-serving code

## Security Notes

**Access Keys:**
- Created manually in DigitalOcean console
- Stored in `terraform.tfvars` (gitignored)
- Passed to Terraform as sensitive variables
- Never logged or exposed in outputs

**Metadata:**
- Bucket name, region, endpoints derived from Terraform
- No hardcoded values in application code
- Single source of truth (infrastructure)

**Separation of Concerns:**
- **Terraform:** Infrastructure credentials (Spaces)
- **SOPS:** External service credentials (Stripe, LiteLLM)
- Clear boundary between infrastructure and application secrets
