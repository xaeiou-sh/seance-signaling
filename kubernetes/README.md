# Seance Kubernetes Development

This directory contains the Kubernetes infrastructure for Seance, designed for local development with hot reload while maintaining production parity.

## Philosophy

**The Goal**: Get the dev experience of `devenv up` (hot reload, local HTTPS, simple orchestration) while learning Kubernetes and preparing for production deployment.

**The Approach**:
- **cdk8s** (TypeScript) - No YAML templating hell, real programming with type safety
- **kind** - Local Kubernetes cluster that feels like production
- **Tilt** - Hot reload and live updates for code changes in containers
- **Standard Dockerfiles** - Simple, cacheable, no Nix complexity yet

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Ingress (nginx)                                    │
│  ├─ dev.localhost → Landing (Vite HMR)             │
│  ├─ backend.dev.localhost → Backend (tsx watch)    │
│  └─ app.dev.localhost → Backend                    │
└─────────────────────────────────────────────────────┘
         │                  │                │
    ┌────┴────┐      ┌──────┴──────┐    ┌───┴────┐
    │ Landing │      │   Backend   │    │ Valkey │
    │ Service │      │   Service   │    │ (Redis)│
    │ :5928   │      │   :8765     │    │ :6379  │
    └─────────┘      └──────┬──────┘    └────────┘
                            │
                     ┌──────┴──────┐
                     │  Signaling  │
                     │   Service   │
                     │   :4444     │
                     └─────────────┘
```

## Project Structure

```
kubernetes/
├── cdk8s/                  # Infrastructure as TypeScript
│   ├── src/
│   │   ├── main.ts         # Entry point
│   │   └── seance-chart.ts # Kubernetes resources defined in TS
│   ├── package.json
│   └── tsconfig.json
├── manifests/              # Generated YAML (gitignored)
├── kind-config.yaml        # Local cluster configuration
└── Tiltfile                # Dev orchestration & hot reload

images/                     # Dockerfiles for each service
├── backend.dockerfile      # Backend with tsx watch
└── landing.dockerfile      # Landing with Vite HMR
```

## Quick Start

### Prerequisites

```bash
# Install tools (macOS)
brew install kind kubectl tilt

# Verify installations
kind version
kubectl version --client
tilt version
```

### First Time Setup

```bash
# 1. Create the local Kubernetes cluster
kind create cluster --config kubernetes/kind-config.yaml

# 2. Install nginx ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# 3. Wait for ingress to be ready (takes ~60 seconds)
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s

# 4. Install cdk8s dependencies
cd kubernetes/cdk8s
npm install
cd ../..

# 5. Start Tilt (this builds images, generates manifests, and deploys)
cd kubernetes
tilt up
```

## Development Workflow

### Start Everything

```bash
cd kubernetes
tilt up
```

This will:
1. Generate Kubernetes manifests from TypeScript (cdk8s)
2. Build Docker images with live update capability
3. Deploy everything to your local kind cluster
4. Set up file watching for hot reload
5. Open the Tilt UI in your browser

### Make Code Changes

**Backend changes**: Edit `backend-trpc/src/**` - changes sync automatically, tsx watch restarts the process

**Frontend changes**: Edit `landing-page/src/**` - Vite HMR applies changes instantly

**Infrastructure changes**: Edit `kubernetes/cdk8s/src/**` - Tilt regenerates and reapplies manifests

### Access Your Services

**Via Ingress (production-like)**:
- Marketing: http://dev.localhost
- Backend API: http://backend.dev.localhost
- Swagger UI: http://backend.dev.localhost/ui
- App: http://app.dev.localhost

**Direct port-forwards (debugging)**:
- Backend: http://localhost:8765
- Landing: http://localhost:5928
- Signaling: ws://localhost:4444
- Valkey: localhost:6379

### View Logs

```bash
# In Tilt UI (browser): Click on any resource to see logs

# Or via kubectl:
kubectl logs -n seance -l app=backend -f
kubectl logs -n seance -l app=landing -f
```

### Stop Everything

```bash
# Ctrl+C in the Tilt terminal, then:
tilt down

# To completely destroy the cluster:
kind delete cluster --name seance-local
```

## How Hot Reload Works

Tilt uses **live_update** to sync file changes into running containers without rebuilding:

1. You edit `backend-trpc/src/index.ts`
2. Tilt detects the change
3. File syncs to `/app/src/index.ts` in the container
4. tsx watch sees the change and restarts the Node process
5. Backend is running new code in ~1 second

This is **way faster** than rebuilding Docker images.

## SSL / HTTPS

**Current state**: Using HTTP for local development

**Next steps for HTTPS**:
1. Install cert-manager: `kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.3/cert-manager.yaml`
2. Create a self-signed CA ClusterIssuer
3. Annotate Ingress with `cert-manager.io/cluster-issuer: "selfsigned"`
4. Trust the CA cert in your system keychain

This mirrors what Caddy does automatically in the devenv setup.

## Nix Integration (Future)

Currently using standard Dockerfiles for simplicity. When ready to optimize:

1. Create `images/base.nix` with common dependencies
2. Use `nix2container` for better layer caching
3. Update Tilt to build Nix images
4. Benefit: Reproducible builds, better caching, smaller incremental rebuilds

**Trade-off**: Complexity now vs optimization later. Start simple.

## cdk8s Advantages

Compare this YAML hell:

```yaml
# Helm template gymnastics
{{- if .Values.backend.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "seance.fullname" . }}-backend
  labels:
    {{- include "seance.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.backend.replicaCount }}
  # ... 50 more lines of templating
{{- end }}
```

To this TypeScript clarity:

```typescript
const backend = new kplus.Deployment(this, 'backend', {
  replicas: 1,
  containers: [{
    image: 'seance-backend:dev',
    portNumber: 8765,
    envVariables: {
      PORT: kplus.EnvValue.fromValue('8765'),
    },
  }],
});
```

**Benefits**:
- Type checking at compile time
- Real if/else and loops, not template syntax
- IDE autocomplete and refactoring
- Generate standard YAML that any tool can consume

## Troubleshooting

### Cluster won't start

```bash
# Delete and recreate
kind delete cluster --name seance-local
kind create cluster --config kubernetes/kind-config.yaml
```

### Ingress not routing

```bash
# Check ingress controller is running
kubectl get pods -n ingress-nginx

# Verify ingress resource
kubectl get ingress -n seance
kubectl describe ingress seance-ingress -n seance
```

### Images won't build

```bash
# Build manually to see errors
cd kubernetes
docker build -f ../images/backend.dockerfile -t seance-backend:dev ..
```

### Hot reload not working

```bash
# Check Tilt logs for sync errors
# Verify file paths in Tiltfile match your project structure
# Ensure the service has write access to synced directories
```

## Learning Resources

- **cdk8s**: https://cdk8s.io/docs/latest/
- **Tilt**: https://docs.tilt.dev/
- **kind**: https://kind.sigs.k8s.io/docs/user/quick-start/
- **Kubernetes basics**: https://kubernetes.io/docs/tutorials/kubernetes-basics/

## Migration Path

This branch is experimental. When ready for production:

1. Add cert-manager for real SSL
2. Optimize Docker images (multi-stage builds or Nix)
3. Add resource limits and requests
4. Configure horizontal pod autoscaling
5. Set up proper secrets management
6. Add health checks and readiness probes
7. Merge to main and deploy to real cluster

For now: **learn, iterate, break things safely**.
