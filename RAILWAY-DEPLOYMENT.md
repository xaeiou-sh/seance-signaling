# Railway Deployment Guide

This guide documents the migration from Kubernetes to Railway for simpler PaaS deployment.

## Architecture Overview

### Services on Railway

All services run as independent Railway services with their own subdomains:

1. **Backend** (`backend.seance.dev`) - Main API server
   - Docker image: `fractalhuman1/seance-backend:$GIT_COMMIT`
   - Port: 8765
   - Connected to: Valkey (Redis)

2. **Landing Page** (`seance.dev`) - Marketing website
   - Docker image: `fractalhuman1/seance-landing:$GIT_COMMIT`
   - Port: 80

3. **Signaling** (`signaling.seance.dev`) - WebRTC signaling server
   - Docker image: `funnyzak/y-webrtc-signaling:latest`
   - Port: 4444

4. **Beholder** (`beholder.seance.dev`) - PostHog reverse proxy
   - Docker image: `fractalhuman1/seance-beholder:$GIT_COMMIT`
   - Port: 80
   - Custom nginx config for PostHog bypass

5. **LiteLLM** (`litellm.seance.dev`) - LLM API gateway
   - Docker image: `fractalhuman1/seance-litellm:$GIT_COMMIT`
   - Port: 4000
   - Custom config with model definitions

6. **Valkey** (internal) - Redis-compatible cache
   - Docker image: `valkey/valkey:latest`
   - Port: 6379
   - Internal-only, accessed by backend

### Infrastructure

- **Railway** - All compute (6 services)
- **DigitalOcean Spaces** - Object storage for build artifacts
- **Cloudflare** - DNS and CDN (proxied CNAMEs)

### Cost Comparison

| Platform | Previous (Kubernetes) | Current (Railway) |
|----------|----------------------|-------------------|
| Compute | $96/month (2x $48 nodes) | ~$20/month (estimate) |
| LoadBalancer | $12/month | $0 (included) |
| Spaces | $5/month | $5/month |
| **Total** | **$113/month** | **~$25/month** |

Railway pricing scales with usage - expect $5-10/month at low traffic, up to $50+/month with significant traffic. Still cheaper than dedicated k8s cluster.

## Prerequisites

### One-Time Setup

1. **Install Railway CLI**
   ```bash
   brew install railway
   ```

2. **Create Railway account and get API token**
   - Sign up at https://railway.app
   - Go to https://railway.app/account/tokens
   - Create new token
   - Export in your shell:
   ```bash
   export RAILWAY_TOKEN="your-token-here"
   ```

3. **Link Railway project** (after first deploy)
   ```bash
   cd /Users/nicole/Documents/seance-signaling
   railway link
   # Select "seance-production" project when prompted
   ```

4. **Verify environment variables are set**
   ```bash
   echo $DIGITALOCEAN_TOKEN
   echo $CLOUDFLARE_API_TOKEN
   echo $RAILWAY_TOKEN
   ```

5. **Ensure Docker buildx is set up**
   ```bash
   docker buildx create --use
   ```

## Deployment Workflow

### Full Deployment (Build + Deploy)

```bash
cd /Users/nicole/Documents/seance-signaling
./scripts/deploy-railway.sh
```

This script will:
1. ✅ Get git commit hash
2. ✅ Build and push 4 Docker images to Docker Hub
   - `seance-backend:$GIT_COMMIT`
   - `seance-landing:$GIT_COMMIT`
   - `seance-beholder:$GIT_COMMIT`
   - `seance-litellm:$GIT_COMMIT`
3. ✅ Run `tofu apply` to create/update Railway services
4. ✅ Create custom domains on Railway
5. ✅ Retrieve CNAMEs from Railway CLI
6. ✅ Update Cloudflare DNS records
7. ✅ Apply secrets from SOPS to Railway services

### Secrets-Only Update

If you only need to update secrets (API keys, etc.):

```bash
./scripts/apply-railway-secrets.sh production
```

## How It Works

### Image Tagging with Git Commits

Every deployment uses the git commit hash as the image tag:

```bash
GIT_COMMIT=$(git rev-parse --short HEAD)  # e.g., "a1b2c3d"
docker build -t fractalhuman1/seance-backend:a1b2c3d .
```

**Benefits:**
- Perfect audit trail (git log shows exact deployed code)
- Easy rollback: `TF_VAR_git_commit=old_hash tofu apply`
- No ambiguity (unlike `:latest`)

### CNAME Retrieval via Railway CLI

Railway Terraform provider can't retrieve CNAME records (known limitation), so we use Railway CLI:

```hcl
data "external" "backend_cname" {
  program = ["bash", "-c", <<-EOF
    railway domain get backend.seance.dev --json | jq -r '{cname: .target}'
  EOF
  ]
}
```

This runs during `tofu apply` and gets the Railway CNAME (e.g., `xyz123.up.railway.app`) to configure Cloudflare DNS.

### Secrets Management

Secrets stay in SOPS (`secrets/secrets.yaml`), metadata computed from Terraform:

```bash
# Load from SOPS
STRIPE_SECRET_KEY=$(sops -d secrets.yaml | yq '.stripe.STRIPE_SECRET_KEY')

# Get from Terraform
SPACES_ENDPOINT=$(tofu output -raw spaces_endpoint)

# Push to Railway
railway variables --service backend set \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  SPACES_ENDPOINT="$SPACES_ENDPOINT"
```

**Single source of truth:**
- Credentials: SOPS (encrypted)
- Infrastructure metadata: Terraform (outputs)
- No manual copying, no duplication

## Custom Domain Setup

Railway creates CNAME targets like `xyz123.up.railway.app`. Cloudflare points to these:

```
backend.seance.dev → CNAME → abc123.up.railway.app (proxied via Cloudflare)
seance.dev         → CNAME → def456.up.railway.app (proxied via Cloudflare)
```

**SSL certificates:** Railway auto-provisions Let's Encrypt certs for all custom domains.

**Cloudflare proxy (orange cloud):** Enabled for CDN + DDoS protection.

## Verification

### 1. Check Railway Status

```bash
railway status
```

Should show all 6 services as "Running".

### 2. Check Service Logs

```bash
railway logs --service backend
railway logs --service landing
railway logs --service litellm
```

### 3. Test Endpoints

```bash
# Backend health check
curl https://backend.seance.dev/

# Landing page
curl -I https://seance.dev/

# Signaling server
curl https://signaling.seance.dev/health

# Beholder (PostHog proxy)
curl https://beholder.seance.dev/health

# LiteLLM
curl https://litellm.seance.dev/health
```

### 4. Verify DNS

```bash
dig backend.seance.dev
dig seance.dev
dig beholder.seance.dev
```

Should all return Cloudflare IPs (proxied).

### 5. Check Spaces Integration

```bash
# Deploy a test file
echo "Test $(date)" | base64 > /tmp/test.b64

curl -X POST https://backend.seance.dev/deploy \
  -H "Content-Type: application/json" \
  -H "X-Builder-Key: $BUILDER_KEY" \
  -d "{\"files\":[{\"path\":\"releases/test.txt\",\"content\":\"$(cat /tmp/test.b64)\"}]}"

# Download from CDN
curl https://seance-cdn.sfo3.cdn.digitaloceanspaces.com/prod/releases/test.txt
```

## Rollback

### Rollback to Previous Commit

```bash
# Find previous commit
git log --oneline

# Redeploy with that commit hash
export TF_VAR_git_commit=abc123f
tofu apply
```

Railway will pull the old image tags and redeploy.

### Emergency Rollback (Manual)

1. Go to Railway dashboard
2. Select service → Deployments tab
3. Click "Rollback" on previous healthy deployment

## Troubleshooting

### "railway: command not found"

Install Railway CLI:
```bash
brew install railway
```

### "No project linked"

Link the project:
```bash
railway link
```

Select "seance-production" when prompted.

### "RAILWAY_TOKEN not set"

Get token from https://railway.app/account/tokens and export:
```bash
export RAILWAY_TOKEN="your-token-here"
```

### "Missing required secret: SPACES_ACCESS_KEY_ID"

Secrets not in SOPS file. Edit:
```bash
sops secrets/secrets.yaml
```

Add:
```yaml
spaces:
  SPACES_ACCESS_KEY_ID: "DO00..."
  SPACES_SECRET_ACCESS_KEY: "..."
```

### Service Won't Start

Check logs:
```bash
railway logs --service backend --tail 100
```

Common issues:
- Missing environment variables
- Port mismatch (check `PORT` env var)
- Container image failed to pull

### DNS Not Resolving

1. Check Cloudflare DNS records in dashboard
2. Verify CNAME targets match Railway:
   ```bash
   railway domain list
   ```
3. Wait up to 5 minutes for DNS propagation

### CNAME Retrieval Fails

If `railway domain get` fails:

1. Manually get CNAME from Railway dashboard
2. Update Terraform temporarily:
   ```hcl
   # Temporarily hardcode CNAME
   content = "xyz123.up.railway.app"  # From Railway dashboard
   ```
3. Run `tofu apply`
4. File issue: Railway CLI may need authentication

## Migration from Kubernetes

The previous Kubernetes setup has been archived in `kubernetes-archive/`.

**What changed:**
- ❌ Removed: All k8s manifests, helm charts, ingress controllers
- ❌ Removed: kubectl, kubeconfig management
- ❌ Removed: DigitalOcean Kubernetes cluster
- ✅ Kept: Docker builds (same images)
- ✅ Kept: Terraform for infrastructure
- ✅ Kept: SOPS for secrets
- ✅ Kept: Spaces for file storage
- ✅ Added: Railway services (6 total)
- ✅ Added: Subdomain-per-service architecture

**Recovery:** If Railway doesn't work out, the k8s code is in `kubernetes-archive/` and can be restored in ~2 hours.

## Design Decisions

### Why Railway Over Kubernetes?

At pre-revenue stage with 0 users:

**Kubernetes cons:**
- ~4 hours/week maintenance (cluster upgrades, cert renewals, debugging pods)
- $113/month for idle cluster
- Complex deployment pipeline
- Overkill for current scale

**Railway pros:**
- Zero maintenance
- ~$20-30/month at current scale
- Simple deployment (`railway up` or Terraform)
- Scales automatically as we grow

### Why Subdomains for Each Service?

**Alternative considered:** Path-based routing (e.g., `backend.seance.dev/litellm`)

**Why subdomains won:**
- Simpler routing (no ingress controller needed)
- Better isolation (separate SSL certs, separate logs)
- Easier to understand (`beholder.seance.dev` vs `/beholder`)
- Railway makes this trivial (just add custom domain)

### Why Keep Docker Builds?

**Alternative considered:** Railway native Git deploys

**Why Docker:**
- Portability (can move to Fly.io, Render, back to k8s, etc.)
- Local testing matches production exactly
- Explicit dependencies (Dockerfile = source of truth)
- Multi-stage builds for optimization

### Why Keep Terraform?

**Alternative considered:** Railway dashboard + CLI only

**Why Terraform:**
- Infrastructure as code (git history)
- Declarative (describe desired state, Terraform does the work)
- Reusable (can recreate entire infra from scratch)
- Review changes before apply (`tofu plan`)

## Next Steps

After first successful deployment:

1. **Set up monitoring:** Railway has built-in metrics, but consider:
   - Sentry for error tracking
   - Better Uptime for uptime monitoring

2. **Configure auto-deploys:** (Optional)
   - Set up GitHub Actions to run `deploy-railway.sh` on main branch push
   - Requires storing RAILWAY_TOKEN as GitHub secret

3. **Scale as needed:**
   - Railway auto-scales within configured limits
   - Monitor costs in Railway dashboard
   - Adjust replica counts if needed

4. **Review costs after 1 month:**
   - Railway bills based on actual usage
   - May be higher/lower than $20 estimate
   - Adjust resource limits if needed
