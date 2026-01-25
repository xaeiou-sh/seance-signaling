# LiteLLM Setup Summary

## What Was Added

1. **LiteLLM Deployment** - Unified LLM API gateway accessible at `{BACKEND_URL}/litellm`
2. **Improved Secrets Management** - Restructured secrets with `yq` for proper YAML parsing
3. **Automatic Secret Mounting** - All secrets automatically available to LiteLLM as environment variables

## Architecture

### Secrets Structure

Secrets are organized by service in `secrets/secrets.yaml`:

**New Format (Recommended):**
```yaml
stripe:
  STRIPE_SECRET_KEY: sk_live_...
  STRIPE_PRICE_ID: price_...

litellm:
  LITELLM_MASTER_KEY: sk-...
  OPENAI_API_KEY: sk-...
  ANTHROPIC_API_KEY: sk-ant-...
  # Add any provider you want - all will be auto-mounted
  COHERE_API_KEY: ...
  HUGGINGFACE_API_KEY: ...
```

**Legacy Flat Format (Still Supported):**
```yaml
STRIPE_SECRET_KEY: sk_live_...
STRIPE_PRICE_ID: price_...
LITELLM_MASTER_KEY: sk-...
OPENAI_API_KEY: sk-...
```

**Key Benefits:**
- Clear organization by service (new format)
- Explicit environment variable names (what you see is what gets set)
- Arbitrary secrets supported - just add new keys
- Type-safe TypeScript parsing with js-yaml
- Secrets decrypted and embedded at manifest generation time

### How It Works

1. **Synth Time**: When you run `npm run synth`, the TypeScript code:
   - Decrypts `secrets/secrets.yaml` using SOPS
   - Parses it as a TypeScript object with js-yaml
   - Validates required secrets exist
   - Flattens nested structure into key-value pairs
   - Generates a Kubernetes Secret resource in the manifest

2. **Deploy Time**: When you apply the manifest:
   - Secret resource is created in the cluster
   - All deployments reference it via `envFrom` or `secretKeyRef`
   - LiteLLM automatically gets all API keys as environment variables

**No separate secret application step needed** - secrets are embedded in the generated manifest.

### Path Routing

Requests to `https://backend.seance.dev/litellm/*` are:
1. Received by nginx ingress
2. Path rewritten: `/litellm/v1/chat` → `/v1/chat`
3. Forwarded to LiteLLM service on port 4000

## Setup Steps

### 1. Install Dependencies

```bash
nix-env -iA nixpkgs.sops
```

### 2. Edit Secrets

```bash
sops secrets/secrets.yaml
```

Add your LiteLLM configuration (using new nested format):
```yaml
stripe:
  STRIPE_SECRET_KEY: sk_live_...
  STRIPE_PRICE_ID: price_...

litellm:
  LITELLM_MASTER_KEY: sk-abc123  # Generate with: echo "sk-$(openssl rand -hex 32)"
  OPENAI_API_KEY: sk-...
  ANTHROPIC_API_KEY: sk-ant-...
```

Or keep using the flat format (legacy):
```yaml
STRIPE_SECRET_KEY: sk_live_...
STRIPE_PRICE_ID: price_...
LITELLM_MASTER_KEY: sk-abc123
OPENAI_API_KEY: sk-...
```

### 3. Generate Manifests

```bash
cd kubernetes/cdk8s
npm run synth
```

This decrypts secrets and embeds them in the generated manifest at `dist/seance.k8s.yaml`.

### 4. Deploy

```bash
# Dev with Tilt (auto-generates manifests)
cd kubernetes && tilt up

# Production
./scripts/deploy-production.sh
```

## Usage

### Access LiteLLM

- **Dev**: `https://backend.dev.localhost/litellm`
- **Prod**: `https://backend.seance.dev/litellm`

### Example Request

```bash
curl https://backend.seance.dev/litellm/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Health Check

```bash
curl https://backend.seance.dev/litellm/health
```

## Adding New LLM Providers

1. Edit secrets:
   ```bash
   sops secrets/secrets.yaml
   ```

2. Add the API key under `litellm:`:
   ```yaml
   litellm:
     TOGETHER_API_KEY: ...
     REPLICATE_API_TOKEN: ...
   ```

3. Regenerate and apply manifests:
   ```bash
   cd kubernetes/cdk8s
   npm run synth
   kubectl apply -f dist/seance.k8s.yaml -n seance
   ```

   Or for production:
   ```bash
   ./scripts/deploy-production.sh
   ```

That's it! No code changes needed - secrets are automatically mounted to LiteLLM.

## Files Modified

### Kubernetes CDK8s
- `kubernetes/cdk8s/src/secrets.ts` - **NEW** TypeScript secrets loader with SOPS + js-yaml
- `kubernetes/cdk8s/src/config.ts` - Added secrets loading, LiteLLM image, port, replicas
- `kubernetes/cdk8s/src/seance-chart.ts` - Generate Secret resource, added LiteLLM deployment, service, ingress
- `kubernetes/Tiltfile` - Added LiteLLM resource, removed apply-secrets step

### Scripts (Legacy - Still Available)
- `scripts/apply-secrets.sh` - Uses `yq` for YAML parsing (optional, not needed for cdk8s workflow)
- `scripts/decrypt-secrets.sh` - Updated to use `yq`

### Documentation
- `kubernetes/LITELLM.md` - Complete LiteLLM usage guide
- `DEPLOY-KUBERNETES.md` - Updated with secrets structure
- `SECRETS.md` - Updated with new secrets format
- `LITELLM-SETUP.md` - This file (summary)

## Troubleshooting

### Check LiteLLM logs
```bash
kubectl logs -n seance -l app=litellm -f
```

### Verify secrets are mounted
```bash
kubectl exec -n seance deployment/litellm -- env | grep API_KEY
```

### Test health endpoint
```bash
curl https://backend.dev.localhost/litellm/health -k
```

### Check ingress routing
```bash
kubectl get ingress -n seance litellm-ingress -o yaml
```

## Design Decisions

### Why TypeScript instead of bash parsing?

**Old approach (bash + yq):**
```bash
STRIPE_KEY=$(sops -d secrets.yaml | yq '.stripe.STRIPE_SECRET_KEY')
kubectl create secret --from-literal=STRIPE_SECRET_KEY="$STRIPE_KEY"
```

**New approach (TypeScript):**
```typescript
const secrets = loadSecrets(); // Decrypt + parse with js-yaml
const appSecrets = new kplus.Secret(this, 'app-secrets', {
  stringData: secrets,
});
```

**Benefits:**
- **Type safety**: TypeScript validates structure at compile time
- **Single language**: No context switching between bash/TypeScript
- **Better errors**: Clear error messages, not cryptic bash failures
- **Testable**: Can unit test secret loading logic
- **DRY**: Secrets decrypted once, used everywhere in TypeScript
- **Zero technical debt**: No fragile bash parsing

### Why structured secrets?

```yaml
# Good: Clear organization + explicit env var names
litellm:
  OPENAI_API_KEY: sk-...

# Bad: Flat structure, unclear ownership
OPENAI_API_KEY: sk-...
```

Benefits:
- Understand which service uses which secrets
- Clear what environment variables are set
- Easy to add new services
- Self-documenting

### Why `envFrom` instead of individual `env`?

```yaml
# With envFrom (current)
envFrom:
  - secretRef:
      name: seance-secrets

# Without envFrom (old way)
env:
  - name: OPENAI_API_KEY
    valueFrom:
      secretKeyRef:
        name: seance-secrets
        key: OPENAI_API_KEY
  # ... repeat for every key
```

Benefits:
- Add new API keys without changing deployment code
- DRY principle - no repetition
- Scales to arbitrary number of providers
- Zero technical debt

## Future Improvements

1. **LiteLLM Config File** - Mount a ConfigMap with `litellm_config.yaml` for advanced routing
2. **Rate Limiting** - Add per-key rate limits in LiteLLM config
3. **Cost Tracking** - Enable LiteLLM's built-in cost tracking
4. **Caching** - Configure Redis for LiteLLM caching (Valkey is already deployed)
5. **Monitoring** - Add Prometheus metrics endpoint
