# Spaces Migration Deployment Guide

This guide outlines the steps required to complete the migration to DigitalOcean Spaces.

## Improvements Over Initial Plan

The implementation was improved based on infrastructure best practices:

**Original Approach:**
- ❌ Manual creation of global Spaces access keys
- ❌ Hardcoded bucket metadata in SOPS secrets
- ❌ Global access keys with permissions to all Spaces

**Improved Approach:**
- ✅ Terraform creates bucket-scoped access keys automatically
- ✅ All metadata derived from Terraform resources
- ✅ Least-privilege security (key only works for this bucket)
- ✅ Zero manual steps for key management

## Architecture Overview

### Infrastructure Management
```
Terraform creates:
  ├── Spaces bucket (seance-cdn)
  ├── Bucket-scoped access key (least privilege)
  └── Kubernetes secret (spaces-credentials)

SOPS manages only:
  ├── Stripe credentials (external service)
  └── LiteLLM API keys (external service)
```

### Deployment Flow
```
GitHub Actions → POST /deploy → Backend uploads to Spaces → CDN serves files
```

## Deployment Steps

### 1. Apply Terraform Configuration

This creates the Spaces bucket, generates bucket-scoped credentials, and creates the Kubernetes secret automatically:

```bash
cd /Users/nicole/Documents/seance-signaling
tofu apply
```

Review the plan and confirm. Terraform will:
- Create `seance-cdn` bucket in `sfo3` region
- Generate bucket-scoped access key (only works for this bucket)
- Create Kubernetes secret `spaces-credentials` in `seance-prod` namespace
- Output CDN endpoint for reference

### 2. Build and Push Backend

```bash
cd backend-trpc
npm install
docker build -t fractalhuman1/seance-backend:spaces .
docker push fractalhuman1/seance-backend:spaces
```

### 3. Deploy to Kubernetes

The manifests already reference the Terraform-managed secret:

```bash
kubectl set image deployment/backend \
  backend=fractalhuman1/seance-backend:spaces \
  -n seance-prod
```

Verify rollout:

```bash
kubectl rollout status deployment/backend -n seance-prod
```

### 4. Verify Deployment

Check backend logs:

```bash
kubectl logs -n seance-prod -l app=backend --tail=50
```

You should see:
```
[Spaces] Initialized - bucket: seance-cdn, prefix: prod
```

Test health endpoint:

```bash
curl https://backend.seance.dev/
# Should return: {"status":"healthy","service":"seance-backend",...}
```

### 5. Test File Upload

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

Expected response:
```json
{
  "success": true,
  "filesDeployed": 1,
  "files": [{
    "path": "releases/test.txt",
    "url": "https://seance-cdn.sfo3.cdn.digitaloceanspaces.com/prod/releases/test.txt",
    "size": 123
  }],
  "timestamp": "2026-01-27T..."
}
```

Download from CDN:

```bash
curl https://seance-cdn.sfo3.cdn.digitaloceanspaces.com/prod/releases/test.txt
# Should return: Test Mon Jan 27 ...
```

### 6. Verify Endpoints

Test all update endpoints:

```bash
# Version API
curl https://backend.seance.dev/updates/api/version.json

# Update manifest (for desktop app)
curl https://backend.seance.dev/updates/darwin-arm64/latest-mac.yml
```

Both should return data from Spaces (not 404).

### 7. Scale Test

Scale backend to verify stateless operation:

```bash
kubectl scale deployment/backend --replicas=3 -n seance-prod
```

Wait for all pods to be ready:

```bash
kubectl get pods -n seance-prod -l app=backend
```

All 3 pods should show `Running` and `1/1 Ready`.

Test upload with multiple replicas:

```bash
# Upload a few test files
for i in {1..5}; do
  echo "Test $i" | base64 | curl -X POST https://backend.seance.dev/deploy \
    -H "Content-Type: application/json" \
    -H "X-Builder-Key: $BUILDER_KEY" \
    -d "{\"files\":[{\"path\":\"test/file$i.txt\",\"content\":\"$(cat -)\"}]}"
done
```

All uploads should succeed regardless of which pod handles the request.

## Configuration

### Environment Variable

The Terraform `environment` variable controls the Spaces path prefix:

```hcl
# terraform.tfvars or pass via CLI
environment = "prod"  # Files stored in prod/ prefix
```

For development:
```bash
tofu apply -var="environment=dev"
```

### Bucket Structure

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

## Security Benefits

### Before
- Global Spaces access keys with access to ALL Spaces buckets
- Keys stored in SOPS with bucket metadata duplicated
- Manual key rotation process

### After
- ✅ **Bucket-scoped keys**: Access limited to `seance-cdn` only
- ✅ **Least privilege**: Key cannot access other Spaces buckets
- ✅ **Infrastructure as code**: Keys managed by Terraform
- ✅ **Automatic rotation**: `tofu taint` + `tofu apply` rotates keys
- ✅ **Audit trail**: Terraform state tracks key lifecycle

## Benefits Summary

- ✅ **Horizontal scaling** - Backend is stateless, can run 3+ replicas
- ✅ **Performance** - CDN serves files at edge locations
- ✅ **Reliability** - Files persist across pod restarts
- ✅ **Security** - Bucket-scoped credentials (least privilege)
- ✅ **Automation** - Zero manual steps for key management
- ✅ **Cost efficiency** - Only +$5/month for Spaces
- ✅ **Code simplification** - Removed 150+ lines of file-serving code
- ✅ **Infrastructure as code** - All configuration in Terraform

## Troubleshooting

### Backend fails to start

Check logs:
```bash
kubectl logs -n seance-prod -l app=backend
```

Common issues:
- `SPACES_ACCESS_KEY_ID is required` → Terraform secret not created yet
- `Failed to upload` → Check bucket permissions or key validity

### Files not accessible via CDN

1. Check bucket CORS configuration:
```bash
tofu state show digitalocean_spaces_bucket.seance_cdn
```

2. Verify ACL on uploaded files (should be `public-read`)

3. Test direct Spaces endpoint (bypassing CDN):
```bash
curl https://sfo3.digitaloceanspaces.com/seance-cdn/prod/releases/test.txt
```

### Key rotation

If credentials are compromised:

```bash
# Mark key for recreation
tofu taint digitalocean_spaces_bucket_key.seance_cdn

# Apply to generate new key and update Kubernetes secret
tofu apply

# Restart backend to pick up new credentials
kubectl rollout restart deployment/backend -n seance-prod
```

Downtime: ~30 seconds (rolling update)
