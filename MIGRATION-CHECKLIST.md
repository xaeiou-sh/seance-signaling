# Migration Checklist: VM → Kubernetes

## Pre-Migration Checklist

- [ ] **Update Let's Encrypt email** in `kubernetes/cdk8s/src/config.ts`
  - Change `letsencryptEmail: 'your-actual-email@example.com'`
  - Run `cd kubernetes/cdk8s && npm run synth && cd ../..`

- [ ] **Build production images**
  - Choose registry: DigitalOcean Container Registry, Docker Hub, or other
  - Build backend: `docker build -f images/backend.dockerfile -t <registry>/seance-backend:latest backend-trpc`
  - Build landing: `docker build -f images/landing.dockerfile -t <registry>/seance-landing:latest landing-page`
  - Push both images

- [ ] **Update image references** in `kubernetes/cdk8s/src/config.ts`
  - Change `images.backend` and `images.landing` to match your registry
  - Run `cd kubernetes/cdk8s && npm run synth && cd ../..`

- [ ] **Verify environment variables are set**
  ```bash
  echo $DIGITALOCEAN_TOKEN
  echo $CLOUDFLARE_API_TOKEN
  ```

- [ ] **Review cost estimate** in `terraform.tfvars`
  - Current: 2 nodes @ $24/month = $48
  - LoadBalancer: $12/month
  - Total: ~$60/month

## Migration Steps

```bash
# 1. Initialize OpenTofu
tofu init

# 2. Review what will change
tofu plan

# Expected changes:
# - DESTROY: digitalocean_droplet.seance_backend
# - DESTROY: digitalocean_firewall.seance
# - DESTROY: local_file.ansible_inventory
# - CREATE: digitalocean_kubernetes_cluster.seance
# - CREATE: helm_release.nginx_ingress
# - CREATE: null_resource.apply_cert_manager
# - CREATE: null_resource.apply_seance
# - UPDATE: cloudflare_record.* (new IP address)

# 3. Apply changes
tofu apply

# This will:
# - Tear down old VM
# - Create Kubernetes cluster (~5 min)
# - Deploy nginx-ingress (~2 min)
# - Deploy cert-manager (~1 min)
# - Deploy Seance apps
# - Update DNS to new LoadBalancer IP

# 4. Wait for completion
# Total time: 10-15 minutes
```

## Post-Migration Verification

```bash
# Set kubeconfig
export KUBECONFIG=.kube/config

# Check cluster
kubectl get nodes

# Check pods
kubectl get pods -n seance-prod

# All pods should be Running:
# - backend
# - landing
# - signaling
# - valkey

# Check certificate
kubectl get certificate -n seance-prod

# STATUS should be "True" (may take 2-3 minutes)

# Check ingress
kubectl get ingress -n seance-prod

# Should have external IP (LoadBalancer IP)

# Wait for DNS propagation (2-3 minutes)
dig backend.seance.dev +short

# Should return LoadBalancer IP

# Test endpoints
curl -I https://backend.seance.dev/
curl -I https://seance.dev/

# Both should return 200 OK with valid Let's Encrypt certificate
```

## Rollback Plan

If something goes wrong:

```bash
# Destroy Kubernetes infrastructure
tofu destroy

# Revert to VM-based deployment
git checkout main  # Or your pre-migration branch
tofu init
tofu apply
```

This will recreate the single VM setup.

## What Changed

### Removed:
- ✗ Single DigitalOcean Droplet ($6/month)
- ✗ Firewall resource (K8s manages this)
- ✗ Ansible inventory generation
- ✗ SSH access requirement
- ✗ systemd service management
- ✗ Zellij session debugging

### Added:
- ✓ DOKS cluster (2 nodes @ $24/month)
- ✓ LoadBalancer ($12/month)
- ✓ nginx-ingress-controller (Helm)
- ✓ cert-manager (cdk8s Helm import)
- ✓ kubectl access
- ✓ Horizontal scaling capability
- ✓ High availability (multi-node)

### Configuration Changes:
- `main.tf` - Completely replaced with Kubernetes resources
- `terraform.tfvars` - Removed SSH key, updated variables
- `kubernetes/cdk8s/src/config.ts` - Set to 'prod' mode
- `.gitignore` - Added `.kube/` directory

### Same:
- Cloudflare DNS (same domains, new IP)
- Same application code
- Same environment variables
- Same secrets (still using dummy values)

## Troubleshooting

**Issue: Certificate stuck in "False" state**
```bash
kubectl describe certificate seance-tls -n seance-prod
kubectl logs -n cert-manager deployment/cert-manager
```

**Issue: Pods stuck in "ImagePullBackOff"**
- Check image names in config.ts match your registry
- Verify images were pushed successfully
- Create image pull secret if using private registry

**Issue: LoadBalancer has no external IP**
```bash
kubectl describe service nginx-ingress-ingress-nginx-controller -n ingress-nginx
```

**Issue: DNS not updating**
- Check Cloudflare API token has "Edit zone DNS" permission
- Manually verify in Cloudflare dashboard
- Wait 2-3 minutes for propagation

## Cost Comparison

### Before (VM):
- Droplet: $6/month
- Total: **$6/month**

### After (Kubernetes):
- Control plane: FREE
- 2x Worker nodes: $48/month
- LoadBalancer: $12/month
- Total: **~$60/month**

### Cost Optimization Options:
1. Use smaller nodes: s-1vcpu-2gb ($12/month × 2 = $24)
2. Reduce to min_nodes = 1 for low traffic
3. Scale up during high traffic periods

## Next Steps After Migration

1. [ ] Set up proper secret management
2. [ ] Configure monitoring (Prometheus/Grafana)
3. [ ] Set up CI/CD pipeline
4. [ ] Configure autoscaling (HPA)
5. [ ] Add backup strategy for Valkey
6. [ ] Review security (network policies, pod security)

## Support

See `DEPLOY-KUBERNETES.md` for detailed documentation.
