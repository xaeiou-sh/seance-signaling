# Railway Migration Summary

## What Changed

### Infrastructure

**Before (Kubernetes):**
- DigitalOcean Kubernetes cluster (2 nodes)
- NGINX Ingress Controller
- LoadBalancer ($12/month)
- Path-based routing (`/beholder`, `/api`, etc.)
- Complex manifest management (cdk8s)

**After (Railway):**
- Railway services (6 services)
- No load balancer needed
- Subdomain routing (`beholder.seance.dev`, etc.)
- Simple Terraform configuration

### Services Architecture

| Service | Before | After |
|---------|--------|-------|
| Backend | `backend.seance.dev/*` | `backend.seance.dev/*` |
| Landing | `seance.dev/*` | `seance.dev/*` |
| Signaling | `signaling.seance.dev/*` (via ingress) | `signaling.seance.dev/*` (direct) |
| Beholder | `backend.seance.dev/beholder/*` | `beholder.seance.dev/*` |
| LiteLLM | `litellm.seance.dev/*` (via ingress) | `litellm.seance.dev/*` (direct) |
| Valkey | Internal service | Internal service (Railway private network) |

### File Changes

**Removed:**
- `kubernetes/` directory (archived to `kubernetes-archive/`)
  - `cdk8s/` - Kubernetes manifest generation
  - `apply-manifests.sh` - Kubernetes deployment script
  - All helm/kubectl related files

**Added:**
- `beholder/` - Custom nginx image for PostHog proxy
  - `Dockerfile`
  - `nginx.conf`
- `litellm/` - Custom LiteLLM image with config
  - `Dockerfile`
  - `litellm-config.yaml`
- `scripts/deploy-railway.sh` - Railway deployment script
- `scripts/apply-railway-secrets.sh` - Secrets management
- `scripts/railway` - Utility script for common operations
- `RAILWAY-DEPLOYMENT.md` - Comprehensive deployment guide

**Modified:**
- `main.tf` - Replaced Kubernetes resources with Railway resources
- `terraform.tfvars` - Updated to reflect Railway costs
- `landing-page/env.public.ts` - PostHog host changed to `beholder.seance.dev`
- `scripts/deploy-production.sh` - Archived (use `deploy-railway.sh`)

**Unchanged:**
- `backend-trpc/` - Same code, same Dockerfile
- `landing-page/` - Same code, same Dockerfile (except PostHog config)
- `secrets/secrets.yaml` - Same secrets structure
- `scripts/apply-secrets.sh` - Still used (Kubernetes version archived)
- DigitalOcean Spaces configuration

## Cost Impact

| Item | Kubernetes | Railway | Savings |
|------|-----------|---------|---------|
| Compute | $96/month | ~$20/month | $76/month |
| LoadBalancer | $12/month | $0 | $12/month |
| Spaces | $5/month | $5/month | $0 |
| **Total** | **$113/month** | **~$25/month** | **~$88/month (78%)** |

*Railway costs scale with usage - this is an estimate for current low-traffic scenario.*

## Deployment Workflow Changes

### Before (Kubernetes)

```bash
# Build images
docker build -t fractalhuman1/seance-backend:$GIT_COMMIT .
docker push fractalhuman1/seance-backend:$GIT_COMMIT

# Generate manifests
cd kubernetes/cdk8s
npm run synth

# Apply to cluster
tofu apply
./scripts/apply-secrets.sh seance-prod prod

# Wait for pods to roll out
kubectl rollout status deployment/backend -n seance-prod
```

### After (Railway)

```bash
# Everything in one script
./scripts/deploy-railway.sh

# Or use shortcut
./scripts/railway deploy
```

## Breaking Changes

### 1. PostHog Endpoint

**Old:** `https://backend.seance.dev/beholder/*`
**New:** `https://beholder.seance.dev/*`

**Impact:** Landing page PostHog config updated (`landing-page/env.public.ts`)

**Action required:** None - already updated in this migration

### 2. Service Discovery

**Old:** Kubernetes DNS (`valkey-service.seance-prod.svc.cluster.local`)
**New:** Railway private network (`REDIS_HOST` env var with service ID)

**Impact:** Backend connects to Valkey via Railway's internal network

**Action required:** None - handled by Terraform variables

### 3. Deployment Commands

**Old:**
- `k8s-deploy` - Deploy to production
- `kubectl get pods` - Check status
- `kubectl logs` - View logs

**New:**
- `./scripts/railway deploy` - Deploy to production
- `railway status` - Check status
- `railway logs --service backend` - View logs

## Rollback Plan

If Railway doesn't work out:

1. **Kubernetes code is archived** in `kubernetes-archive/`

2. **Restore Kubernetes:**
   ```bash
   # Copy k8s files back
   mv kubernetes-archive kubernetes

   # Restore main.tf from git history
   git show HEAD~1:main.tf > main.tf

   # Deploy Kubernetes cluster
   tofu apply
   ```

3. **Recovery time:** ~2 hours (cluster creation + deployment)

4. **Data safety:** Spaces files are unchanged, secrets in SOPS unchanged

## Testing Checklist

Before considering migration complete, verify:

- [ ] All 6 services deploy successfully to Railway
- [ ] Custom domains configured (`railway domain list`)
- [ ] Cloudflare DNS points to Railway CNAMEs
- [ ] Secrets applied (`railway variables --service backend`)
- [ ] Backend can connect to Valkey
- [ ] Backend can upload to Spaces
- [ ] PostHog events from landing page reach beholder.seance.dev
- [ ] LiteLLM responds to API calls
- [ ] Signaling server handles WebRTC connections
- [ ] All endpoints return 200 OK:
  - `https://backend.seance.dev/`
  - `https://seance.dev/`
  - `https://signaling.seance.dev/health`
  - `https://beholder.seance.dev/health`
  - `https://litellm.seance.dev/health`

## Known Issues & Workarounds

### Issue: Railway Terraform provider can't retrieve CNAMEs

**Status:** Known limitation (GitHub issue #11)

**Solution:** Manual two-step process:
1. First `tofu apply` creates Railway custom domains
2. Manually copy CNAMEs from Railway dashboard to `terraform.tfvars`
3. Second `tofu apply` creates Cloudflare DNS records

**Implementation:**
- CNAMEs stored as Terraform variables in `terraform.tfvars`
- One-time setup (CNAMEs don't change after creation)
- Simpler and more reliable than CLI automation

**Example:**
```bash
# Step 1: Deploy Railway services
./scripts/deploy-railway.sh

# Step 2: Get CNAMEs
railway domain list

# Step 3: Add to terraform.tfvars
railway_cname_backend = "abc123.up.railway.app"

# Step 4: Apply DNS
tofu apply
```

## Next Steps

1. **Test deployment:**
   ```bash
   ./scripts/deploy-railway.sh
   ```

2. **Verify all services running:**
   ```bash
   railway status
   ```

3. **Test all endpoints** (see Testing Checklist above)

4. **Monitor Railway costs** for first month

5. **Once stable, destroy Kubernetes cluster:**
   ```bash
   # In main.tf, comment out or remove digitalocean_kubernetes_cluster resource
   tofu apply  # This will destroy the cluster
   ```

6. **Update documentation** to remove k8s references

## Questions & Feedback

This migration prioritizes:
- ✅ **Simplicity** - One script deploys everything
- ✅ **Cost** - ~78% cheaper than Kubernetes
- ✅ **Maintainability** - Zero infrastructure management
- ✅ **Portability** - Docker images work anywhere

Tradeoffs:
- ⚠️ **Less control** - Railway manages infrastructure
- ⚠️ **Vendor lock-in** - Harder to migrate than with k8s
- ⚠️ **Costs may rise** - Scales with usage

At pre-revenue stage with 0 users, this is the right call. Re-evaluate when:
- Monthly costs exceed $100
- Need advanced networking (VPC, private subnets)
- Scale to >50 req/sec sustained

---

**Migration completed on:** 2026-01-29
**Kubernetes archived in:** `kubernetes-archive/`
**Recovery path:** Available via git history + archived files
