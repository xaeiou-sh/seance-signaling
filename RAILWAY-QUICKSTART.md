# Railway Deployment - Quick Start

Simple two-step deployment process.

## Prerequisites (One-Time)

1. **Install Railway CLI**
   ```bash
   brew install railway
   ```

2. **Get Railway API token**
   - Go to: https://railway.app/account/tokens
   - Create new token
   - Export:
   ```bash
   export RAILWAY_TOKEN="your-token-here"
   ```

3. **Make scripts executable**
   ```bash
   chmod +x scripts/deploy-railway.sh
   chmod +x scripts/apply-railway-secrets.sh
   ```

## Deployment Process

### Step 1: Initial Deploy (Creates Railway Services)

**Option A: Build and deploy in one step (recommended for first deployment):**
```bash
./scripts/deploy-railway.sh
```

**Option B: Build images separately, then deploy:**
```bash
./scripts/build-images.sh              # Build and push images
./scripts/deploy-railway.sh --skip-build  # Deploy without rebuilding
```

This will:
- Build and push 4 Docker images (unless --skip-build)
- Create Railway project + 6 services
- Create custom domains on Railway
- Create DigitalOcean Spaces bucket
- **Note:** Cloudflare DNS won't be created yet (CNAMEs pending)

### Step 2: Get CNAMEs from Railway

After first deploy, Railway generates CNAME targets. Get them:

**Option A: Via Railway Dashboard**
1. Go to: https://railway.app/project/seance-production
2. For each service:
   - Click service → Settings → Domains
   - Copy the CNAME target (looks like `abc123.up.railway.app`)

**Option B: Via Railway CLI**
```bash
railway domain list
```

You'll see something like:
```
backend.seance.dev → abc123.up.railway.app
seance.dev → def456.up.railway.app
signaling.seance.dev → ghi789.up.railway.app
beholder.seance.dev → jkl012.up.railway.app
litellm.seance.dev → mno345.up.railway.app
```

### Step 3: Add CNAMEs to terraform.tfvars

Edit `terraform.tfvars` and add the CNAMEs:

```bash
# Add these lines (replace with actual CNAMEs from Railway):
railway_cname_backend   = "abc123.up.railway.app"
railway_cname_landing   = "def456.up.railway.app"
railway_cname_signaling = "ghi789.up.railway.app"
railway_cname_beholder  = "jkl012.up.railway.app"
railway_cname_litellm   = "mno345.up.railway.app"
```

### Step 4: Apply Again (Creates DNS Records)

```bash
cd /Users/nicole/Documents/seance-signaling
export TF_VAR_git_commit=$(git rev-parse --short HEAD)
tofu apply
```

This creates the Cloudflare DNS records pointing to Railway.

### Step 5: Link Railway Project (Optional)

For easier CLI usage:

```bash
railway link
# Select "seance-production" when prompted
```

Now you can use shortcuts:
```bash
railway status
railway logs --service backend
```

## Verify Deployment

```bash
# Check all services are running
railway status

# Test endpoints
curl https://backend.seance.dev/
curl https://seance.dev/
curl https://signaling.seance.dev/health
curl https://beholder.seance.dev/health
curl https://litellm.seance.dev/health
```

## Future Deployments

After initial setup:

**Full deployment (build + deploy):**
```bash
./scripts/deploy-railway.sh
```

**Deploy Terraform changes only (faster):**
```bash
./scripts/deploy-railway.sh --skip-build
```

**Build images without deploying:**
```bash
./scripts/build-images.sh
```

DNS stays the same (CNAMEs don't change after initial setup).

## Script Reference

### build-images.sh
Builds and pushes all Docker images to Docker Hub.

**Usage:**
```bash
./scripts/build-images.sh              # Use current git commit
./scripts/build-images.sh abc123f      # Use specific commit hash
```

**When to use:**
- Building images for local testing
- Pre-building images before deployment
- CI/CD pipelines that separate build and deploy

### deploy-railway.sh
Deploys to Railway via Terraform, optionally building images first.

**Usage:**
```bash
./scripts/deploy-railway.sh            # Build + deploy
./scripts/deploy-railway.sh --skip-build  # Deploy only
```

**When to use:**
- Full deployment (default)
- Deploy Terraform changes without rebuilding images (--skip-build)
- After manually building images with build-images.sh

## Update Secrets Only

```bash
./scripts/apply-railway-secrets.sh production
```

## Troubleshooting

### "No project linked"

Run:
```bash
railway link
```

### DNS not resolving

Wait 5-10 minutes for DNS propagation. Check:
```bash
dig backend.seance.dev
```

### Service won't start

Check logs:
```bash
railway logs --service backend --tail 100
```

## Cost Monitoring

Check Railway usage dashboard:
```bash
railway open
```

Or go to: https://railway.app/project/seance-production

Expected cost: ~$20-30/month (scales with usage)

---

**Full documentation:** See RAILWAY-DEPLOYMENT.md
**Migration details:** See RAILWAY-MIGRATION-SUMMARY.md
