# Kubernetes Deployment Guide

Deploy Seance to DigitalOcean Kubernetes (DOKS) using OpenTofu and cdk8s.

## Architecture

**Replaces single VM** with Kubernetes cluster:
- DigitalOcean Kubernetes (DOKS) managed cluster
- nginx-ingress-controller with LoadBalancer ($12/month)
- cert-manager with Let's Encrypt production certificates
- Cloudflare DNS pointing to LoadBalancer IP
- Your application running in `seance-prod` namespace

**Cost breakdown:**
- Control plane: FREE (managed by DigitalOcean)
- Worker nodes: 2x s-2vcpu-4gb @ $24/month = $48/month
- LoadBalancer: $12/month
- **Total: ~$60/month** (vs $6/month single VM)

## Prerequisites

**1. Setup SOPS for Secrets**

Install SOPS and age encryption:
```bash
nix-env -iA nixpkgs.sops
```

Get the age key from team or generate a new one:
```bash
mkdir -p "$HOME/Library/Application Support/sops/age"
age-keygen -o "$HOME/Library/Application Support/sops/age/keys.txt"
chmod 600 "$HOME/Library/Application Support/sops/age/keys.txt"
# Update secrets/.sops.yaml with the public key from output
```

Edit secrets:
```bash
sops secrets/secrets.yaml
```

The secrets file is organized by service. Ensure production secrets are set:
```yaml
stripe:
  STRIPE_SECRET_KEY: sk_live_...  # Your Stripe secret key
  STRIPE_PRICE_ID: price_...  # Your Stripe price ID

litellm:
  LITELLM_MASTER_KEY: sk-...  # Generate with: echo "sk-$(openssl rand -hex 32)"
  OPENAI_API_KEY: sk-...  # Optional: Your OpenAI API key
  ANTHROPIC_API_KEY: sk-ant-...  # Optional: Your Anthropic API key
```

Builder key hashes are already hardcoded in the backend code.

See `secrets/README.md` and `kubernetes/LITELLM.md` for complete documentation.

**2. Update Let's Encrypt Email**

Edit `kubernetes/cdk8s/src/config.ts` and update:
```typescript
letsencryptEmail: 'your-actual-email@example.com',
```

Then regenerate manifests:
```bash
cd kubernetes/cdk8s
npm run synth
cd ../..
```

**2. Environment Variables**

```bash
# DigitalOcean API token
# Get from: https://cloud.digitalocean.com/account/api/tokens
export DIGITALOCEAN_TOKEN=your_token_here

# Cloudflare API token
# Get from: https://dash.cloudflare.com/profile/api-tokens
# Use "Edit zone DNS" template for seance.dev zone
export CLOUDFLARE_API_TOKEN=your_token_here
```

**3. Build and Push Production Images**

Your production images need to be accessible to the cluster. Options:

**Option A: Use DigitalOcean Container Registry**
```bash
# Create a registry at cloud.digitalocean.com/registry
# Then build and push:
docker build -f images/backend.dockerfile -t registry.digitalocean.com/seance/backend:latest backend-trpc
docker build -f images/landing.dockerfile -t registry.digitalocean.com/seance/landing:latest landing-page

docker push registry.digitalocean.com/seance/backend:latest
docker push registry.digitalocean.com/seance/landing:latest
```

**Option B: Use Docker Hub or other registry**
```bash
docker build -f images/backend.dockerfile -t yourusername/seance-backend:latest backend-trpc
docker build -f images/landing.dockerfile -t yourusername/seance-landing:latest landing-page

docker push yourusername/seance-backend:latest
docker push yourusername/seance-landing:latest
```

Then update `kubernetes/cdk8s/src/config.ts` images section to match your registry.

## Deploy

### Step 1: Initialize OpenTofu

```bash
tofu init
```

This will download the required providers:
- digitalocean
- cloudflare
- kubernetes
- helm

### Step 2: Review the Plan

```bash
tofu plan
```

This will show you:
- Old resources to be **destroyed** (droplet, firewall)
- New resources to be **created** (DOKS cluster, nginx-ingress, DNS updates)

### Step 3: Apply Changes

```bash
tofu apply
```

Type `yes` to confirm. This will:

1. **Destroy old VM infrastructure** (droplet, firewall)
2. **Create DOKS cluster** (~5 minutes)
3. **Install nginx-ingress** via Helm (~2 minutes)
4. **Deploy cert-manager** (~1 minute)
5. **Deploy Seance apps** (backend, landing, signaling, valkey)
6. **Update Cloudflare DNS** to point to LoadBalancer IP

**Total time: ~10-15 minutes**

### Step 4: Verify Deployment

```bash
# Check cluster is ready
export KUBECONFIG=.kube/config
kubectl get nodes

# Check all pods are running
kubectl get pods -n seance-prod

# Check certificate is issued
kubectl get certificate -n seance-prod

# Check ingress has external IP
kubectl get ingress -n seance-prod
```

### Step 5: Test Endpoints

Wait 2-3 minutes for DNS to propagate, then:

```bash
# Check DNS resolution
dig backend.seance.dev +short

# Test HTTPS endpoints (Let's Encrypt production certs)
curl https://backend.seance.dev/
curl https://backend.seance.dev/ui  # Swagger UI
curl https://seance.dev/            # Landing page
```

Your browser should show valid Let's Encrypt certificates (no warnings).

## Access Cluster

The kubeconfig is saved to `.kube/config` in the repo root.

```bash
export KUBECONFIG=/Users/nicole/Documents/seance-signaling/.kube/config

# View all resources
kubectl get all -n seance-prod

# View logs
kubectl logs -n seance-prod deployment/backend
kubectl logs -n seance-prod deployment/landing

# Get a shell in a pod
kubectl exec -it -n seance-prod deployment/backend -- sh

# Port-forward for debugging
kubectl port-forward -n seance-prod service/backend-service 8765:8765
```

## Update Application

When you make code changes:

**1. Rebuild and push images:**
```bash
docker build -f images/backend.dockerfile -t registry.digitalocean.com/seance/backend:latest backend-trpc
docker push registry.digitalocean.com/seance/backend:latest
```

**2. Restart deployment:**
```bash
kubectl rollout restart deployment/backend -n seance-prod
```

**Or use image tags and update config.ts:**
```typescript
images: {
  backend: 'registry.digitalocean.com/seance/backend:v1.2.3',
}
```
Then `npm run synth` and `tofu apply`.

## Update Infrastructure

**Change cluster size:**
Edit `terraform.tfvars`:
```hcl
min_nodes = 3  # Scale up
node_size = "s-4vcpu-8gb"  # Bigger nodes
```

Apply:
```bash
tofu apply
```

**Update Kubernetes manifests:**
1. Edit `kubernetes/cdk8s/src/config.ts` or `seance-chart.ts`
2. Regenerate: `cd kubernetes/cdk8s && npm run synth`
3. Apply: `tofu apply`

## Monitoring

**View real-time logs:**
```bash
# All pods in namespace
kubectl logs -f -n seance-prod --all-containers=true -l app.kubernetes.io/name=backend

# Specific deployment
kubectl logs -f -n seance-prod deployment/backend
```

**Check resource usage:**
```bash
kubectl top nodes
kubectl top pods -n seance-prod
```

**Check certificate status:**
```bash
kubectl describe certificate seance-tls -n seance-prod
kubectl describe certificaterequest -n seance-prod
```

## Troubleshooting

**Pods not starting:**
```bash
kubectl describe pod -n seance-prod <pod-name>
kubectl logs -n seance-prod <pod-name>
```

**Certificate not issued:**
```bash
# Check certificate status
kubectl get certificate -n seance-prod
kubectl describe certificate seance-tls -n seance-prod

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager

# Check Let's Encrypt challenge
kubectl get challenges -n seance-prod
```

**DNS not resolving:**
```bash
# Check LoadBalancer IP
kubectl get ingress -n seance-prod

# Check Cloudflare DNS
dig backend.seance.dev +short

# Compare IPs - they should match
```

**Image pull errors:**
```bash
# If using private registry, create image pull secret
kubectl create secret docker-registry regcred \
  --docker-server=registry.digitalocean.com \
  --docker-username=<token> \
  --docker-password=<token> \
  -n seance-prod

# Then update deployment to use it (in seance-chart.ts)
```

## Destroy Infrastructure

**Warning:** This will delete the cluster and all data.

```bash
tofu destroy
```

This will:
- Delete DOKS cluster
- Delete LoadBalancer
- Remove Cloudflare DNS records
- Keep local kubeconfig and manifest files

## Comparison: VM vs Kubernetes

### Old (VM):
- Cost: $6/month
- Single point of failure
- Manual SSH for debugging
- Updates via git pull + restart
- Zellij session for process management

### New (Kubernetes):
- Cost: ~$60/month
- High availability (2+ nodes)
- kubectl for debugging
- Updates via docker push + rollout
- Kubernetes manages processes

**Trade-offs:**
- 10x cost increase
- Production-grade reliability
- Easier scaling (horizontal and vertical)
- Learning Kubernetes concepts
- No more Ansible/systemd management

## Next Steps

**Production hardening:**
1. ✅ ~~Set up proper secret management~~ (Already using SOPS+age)
2. Configure HorizontalPodAutoscaler for traffic-based scaling
3. Add monitoring (Prometheus + Grafana)
4. Set up log aggregation (Loki or Elasticsearch)
5. Configure backup for Valkey data (if needed)
6. Add network policies for security
7. Set up CI/CD for automated deployments

**Cost optimization:**
- Use smaller nodes: s-1vcpu-2gb ($12/month)
- Reduce min_nodes to 1 for low-traffic periods
- Use spot instances (not yet available on DOKS)
