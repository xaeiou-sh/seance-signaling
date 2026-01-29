# LiteLLM Integration

LiteLLM is now integrated into the Kubernetes cluster as an API gateway for LLM providers (OpenAI, Anthropic, etc.).

## Access

LiteLLM is available at:
- Dev: `https://backend.dev.localhost/litellm`
- Prod: `https://backend.seance.dev/litellm`

## Setup

### 1. Add Secrets

Edit the secrets file:
```bash
sops secrets/secrets.yaml
```

The secrets file is organized by service. Add your LiteLLM secrets under the `litellm` section:
```yaml
stripe:
  STRIPE_SECRET_KEY: sk_live_...
  STRIPE_PRICE_ID: price_...

litellm:
  LITELLM_MASTER_KEY: sk-your-master-key-here  # Generate with: openssl rand -hex 32
  OPENAI_API_KEY: sk-...  # Optional: Your OpenAI API key
  ANTHROPIC_API_KEY: sk-ant-...  # Optional: Your Anthropic API key
  COHERE_API_KEY: ...  # Optional: Add any provider you want
  HUGGINGFACE_API_KEY: ...  # Optional
```

The LITELLM_MASTER_KEY is used to authenticate requests to the LiteLLM proxy. Generate one with:
```bash
echo "sk-$(openssl rand -hex 32)"
```

**Note**: All keys under each service section are automatically extracted and made available as environment variables. The key names (e.g., `OPENAI_API_KEY`) are the actual environment variable names that will be set.

### 2. Apply Secrets

After editing secrets, apply them to the cluster:
```bash
# For dev
./scripts/apply-secrets.sh seance

# For prod
./scripts/apply-secrets.sh seance-prod
```

### 3. Deploy

For dev (with Tilt):
```bash
cd kubernetes
tilt up
```

For prod:
```bash
./scripts/deploy-production.sh
```

## Available Models

The following custom models are configured:

- **seance-oss-large**: MiniMax-M2 via OpenRouter (high throughput)
- **seance-oss-medium**: GPT-OSS-120B via OpenRouter (high throughput)

These models are defined in `kubernetes/cdk8s/litellm-config.yaml`.

## Usage

### API Endpoints

LiteLLM provides an OpenAI-compatible API:

- `/v1/chat/completions` - Chat completions
- `/v1/completions` - Text completions
- `/v1/embeddings` - Embeddings
- `/health` - Health check
- `/model/info` - List available models

### Example Requests

Using the custom seance-oss-large model:
```bash
curl https://litellm.seance.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -d '{
    "model": "seance-oss-large",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

Using the custom seance-oss-medium model:
```bash
curl https://litellm.seance.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -d '{
    "model": "seance-oss-medium",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Testing Models

Run the test script to verify all models are working:
```bash
# For dev environment
export LITELLM_MASTER_KEY=$(sops -d secrets/secrets.yaml | grep LITELLM_MASTER_KEY | cut -d: -f2 | xargs)
./kubernetes/test-litellm-models.sh

# For production
./kubernetes/test-litellm-models.sh prod
```

## Configuration

LiteLLM is configured with:
- **Image**: `ghcr.io/berriai/litellm:main-latest`
- **Port**: 4000 (internal)
- **Replicas**: 1
- **Resources**: 250m-1000m CPU, 512Mi-1Gi memory
- **Config File**: `kubernetes/cdk8s/litellm-config.yaml` (mounted as ConfigMap)

### Adding New Models

To add new models, edit `kubernetes/cdk8s/litellm-config.yaml`:

```yaml
model_list:
  - model_name: my-custom-model
    litellm_params:
      model: openrouter/provider/model-name
      api_key: os.environ/OPENROUTER_API_KEY
```

Then regenerate and deploy:
```bash
cd kubernetes/cdk8s
npm run synth
kubectl apply -f dist/seance.k8s.yaml -n seance
```

## Routing

LiteLLM is exposed on a separate subdomain:
- Dev: `https://litellm.dev.localhost`
- Prod: `https://litellm.seance.dev`

Requests are routed directly to the litellm-service without path rewriting.

## Troubleshooting

### Check LiteLLM logs
```bash
kubectl logs -n seance -l app.kubernetes.io/name=litellm --tail=100 -f
```

### Check ingress
```bash
kubectl get ingress -n seance litellm-ingress -o yaml
```

### Test health endpoint
```bash
curl https://backend.dev.localhost/litellm/health
```

### Verify secrets
```bash
kubectl get secret -n seance seance-secrets -o yaml
```

## Adding More LLM Providers

To add more LLM providers (e.g., Cohere, Hugging Face), add their API keys to `secrets/secrets.yaml`:

```yaml
COHERE_API_KEY: your-key-here
HUGGINGFACE_API_KEY: your-key-here
```

Then update `/kubernetes/cdk8s/src/seance-chart.ts` to add the environment variables to the LiteLLM deployment (uncomment and add as needed).

After making changes, regenerate manifests and deploy:
```bash
cd kubernetes/cdk8s
npm run synth
cd ..
tilt up  # or deploy-production.sh for prod
```
