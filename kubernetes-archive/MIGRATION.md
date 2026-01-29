# Kubernetes Migration Notes

This document tracks the migration from devenv to Kubernetes for local development.

## What We're Building

A Kubernetes-based development environment that maintains the same developer experience as the current devenv setup, while learning k8s patterns and preparing for production deployment.

## Design Decisions

### 1. cdk8s over Helm

**Why**: Helm templates are YAML templating hell. Three layers deep you're debugging `{{- if .Values.foo }}` syntax instead of solving problems.

**What we chose**: cdk8s with TypeScript
- Real programming language with type safety
- Compile-time validation
- IDE support (autocomplete, refactoring)
- Generates standard Kubernetes YAML

**Trade-off**: None. This is strictly better than Helm for our use case.

### 2. Tilt over Manual kubectl

**Why**: We want hot reload like `devenv up`, not `docker build && kubectl apply` cycles.

**What Tilt gives us**:
- File watching and live updates
- Syncs code changes into running containers
- Rebuilds only when necessary
- Nice UI for logs and status

**Trade-off**: Another tool to learn, but it's worth it for the dev experience.

### 3. kind over Minikube/Docker Desktop

**Why**: kind runs Kubernetes in Docker, so it's fast and isolated. It's also what Kubernetes upstream uses for testing.

**Advantages**:
- Closer to production (real k8s, not a subset)
- Multiple clusters easily
- Consistent across machines
- Good ingress support

**Trade-off**: Need to expose ports for ingress, but that's one-time config.

### 4. Standard Dockerfiles over Nix (for now)

**Why**: Keep it simple while learning. Nix adds complexity we don't need yet.

**Current approach**:
- Multi-stage Dockerfiles for caching
- Separate images for backend/frontend
- Standard FROM node:22-alpine

**Future optimization**:
- Use nix2container for better layer caching
- Create base images with common dependencies
- Reproducible builds

**Trade-off**: Larger images and slower rebuilds for now, but simpler to debug and understand.

### 5. HTTP over HTTPS (initially)

**Why**: Get it working first, add SSL second.

**Current**: HTTP with ingress on .localhost domains

**Next step**: cert-manager with self-signed CA

**Trade-off**: Can't test SSL-specific issues locally yet, but we'll add it soon.

## Architecture Comparison

### Before (devenv)

```
Caddyfile (automatic HTTPS)
  ↓
devenv processes
  - backend (tsx watch)
  - landing (vite dev)
  - signaling (docker)
  - valkey (binary)
```

**Pros**: Simple, fast startup, automatic SSL
**Cons**: Not like production, hard to deploy elsewhere

### After (Kubernetes)

```
nginx Ingress (HTTP → HTTPS later)
  ↓
Kubernetes Services
  - backend deployment (tsx watch in container)
  - landing deployment (vite dev in container)
  - signaling deployment (docker image)
  - valkey deployment (docker image)
```

**Pros**: Production-like, portable, scalable, great learning
**Cons**: More moving parts, slower startup first time

## What We Kept From devenv

1. **Hot reload**: Tilt syncs files, tsx watch restarts
2. **Local domains**: .localhost via ingress
3. **Process isolation**: Pods instead of devenv processes
4. **Environment variables**: ConfigMaps and env in deployments
5. **Simple commands**: `./setup.sh` once, `tilt up` to start

## What We Lost (temporarily)

1. **Automatic HTTPS**: Coming with cert-manager
2. **Instant startup**: kind takes ~30s first time, Tilt builds images
3. **Single config file**: Now split across cdk8s TypeScript files

## What We Gained

1. **Production parity**: Same primitives (pods, services, ingress) as production
2. **Type safety**: cdk8s validates at compile time
3. **Scalability**: Can easily add replicas, autoscaling
4. **Portability**: Works on any k8s cluster, not just local machine
5. **Learning**: Understanding k8s deeply

## Current Status

**Working**:
- ✅ cdk8s generates valid Kubernetes manifests
- ✅ kind cluster configuration with ingress
- ✅ Tiltfile for hot reload
- ✅ Dockerfiles for backend and landing

**TODO**:
- ⏳ Test the full setup end-to-end
- ⏳ Add cert-manager for HTTPS
- ⏳ Configure backend to proxy signaling correctly
- ⏳ Add health checks and readiness probes
- ⏳ Optimize Docker images (multi-stage builds)
- ⏳ Add Nix-based container images
- ⏳ Document production deployment path

## How to Test

```bash
# From kubernetes directory
./setup.sh        # One-time setup
tilt up           # Start everything
```

Then visit:
- http://dev.localhost - Landing page
- http://backend.dev.localhost - Backend API
- http://backend.dev.localhost/ui - Swagger docs

Edit code in `backend-trpc/src` or `landing-page/src` and watch it hot reload.

## Questions to Answer

1. **Is hot reload actually as fast as devenv?**
   - Need to test with Tilt live_update

2. **Does the backend correctly proxy to signaling service?**
   - Current Caddyfile does this, need to verify in k8s

3. **How do we handle secrets in k8s?**
   - Current: .env file
   - k8s: Secrets resource or external secrets operator

4. **How does this deploy to production?**
   - Same manifests, different namespace
   - Use prod images (not :dev tags)
   - Real domain in ingress
   - Real TLS certs (Let's Encrypt via cert-manager)

## Next Steps

1. Run `./setup.sh` and test everything works
2. Fix any issues with service connectivity
3. Add HTTPS with cert-manager
4. Optimize Docker images
5. Document production deployment
6. Consider adding Nix for reproducible builds

## Comparison with Other Projects

This setup is inspired by modern k8s dev practices:

- **Stripe**: Uses Tilt for local k8s dev
- **Airbnb**: cdk8s for infrastructure as code
- **Shopify**: kind for local development
- **Everyone else**: Suffering with Helm

We're learning from the best.
