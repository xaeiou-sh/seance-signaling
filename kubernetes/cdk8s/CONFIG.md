# Kubernetes Configuration Guide

All Kubernetes infrastructure is configured via `src/config.ts`. This is a single source of truth for environment-specific values.

## Switching Environments

To deploy to a different environment, edit **one line** in `src/config.ts`:

```typescript
// Change this line:
export const ENVIRONMENT: DeploymentEnvironment = 'dev';  // or 'prod'
```

Then regenerate manifests:

```bash
npm run synth
```

That's it! Everything else is computed automatically.

## What Changes Between Environments

### Dev Environment (`ENVIRONMENT = 'dev'`)

```typescript
{
  baseDomain: 'dev.localhost',
  namespace: 'seance',
  replicas: { backend: 1, landing: 1, signaling: 1 },
  images: {
    backend: 'seance-backend:dev',
    landing: 'seance-landing:dev',
  },
  tls: { issuer: 'selfsigned-issuer' },
  redis: { persistence: false },  // No data persistence
}
```

**URLs**:
- Marketing: `https://dev.localhost`
- Backend: `https://backend.dev.localhost`
- App: `https://app.dev.localhost`

### Prod Environment (`ENVIRONMENT = 'prod'`)

```typescript
{
  baseDomain: 'seance.dev',
  namespace: 'seance-prod',
  replicas: { backend: 3, landing: 2, signaling: 2 },
  images: {
    backend: 'seance-backend:latest',
    landing: 'seance-landing:latest',
  },
  tls: { issuer: 'letsencrypt-prod' },
  redis: { persistence: true },  // Data persisted to disk
}
```

**URLs**:
- Marketing: `https://seance.dev`
- Backend: `https://backend.seance.dev`
- App: `https://app.seance.dev`

## Configuration Structure

### Computed Values (Read-Only)

These are automatically derived from `baseDomain`:

```typescript
CONFIG.backendDomain   // 'backend.dev.localhost' or 'backend.seance.dev'
CONFIG.appDomain       // 'app.dev.localhost' or 'app.seance.dev'
CONFIG.marketingDomain // 'dev.localhost' or 'seance.dev'
```

**Why getters?** They ensure domains are always consistent - you can't accidentally have `baseDomain = 'seance.dev'` but `backendDomain = 'backend.dev.localhost'`.

### Explicit Values

These are set explicitly per environment:

- **Images**: Dev uses `:dev` tags, prod uses `:latest`
- **Replicas**: Dev runs 1 replica, prod runs multiple
- **Resources**: Dev has lower CPU/memory limits for local clusters
- **TLS**: Dev uses self-signed certs, prod uses Let's Encrypt

### Secrets (TODO)

Currently using dummy values in both environments:

```typescript
secrets: {
  stripeSecretKey: 'sk_test_dummy_dev_key_replace_in_production',
  stripePriceId: 'price_dummy_dev_id_replace_in_production',
  builderKeyHashes: 'adf1e1bee2a545ca24690755a59ea58af30cf9f86692541a6a932a75dc831334',
}
```

**Before production deployment**: Replace with proper secret references (Kubernetes Secrets via Vault or AWS Secrets Manager).

## Adding New Environments

To add staging:

1. Update the type:
```typescript
export type DeploymentEnvironment = 'dev' | 'staging' | 'prod';
```

2. Add staging values to `BASE_DOMAINS`:
```typescript
const BASE_DOMAINS = {
  dev: 'dev.localhost',
  staging: 'staging.seance.dev',
  prod: 'seance.dev',
} as const;
```

3. Add environment-specific logic:
```typescript
replicas: {
  backend: ENVIRONMENT === 'dev' ? 1 : ENVIRONMENT === 'staging' ? 2 : 3,
  // ...
}
```

## Type Safety

TypeScript enforces:
- `ENVIRONMENT` must be `'dev'` or `'prod'` (or other defined values)
- All required config fields must be present
- Typos in config keys are compile errors

This prevents configuration errors at build time, not deploy time.

## Best Practices

### ✅ DO

- Change `ENVIRONMENT` to switch between dev/prod
- Use `CONFIG.backendDomain` instead of hardcoding domains
- Add new fields to `CONFIG` when needed
- Use conditional logic for environment-specific behavior

### ❌ DON'T

- Hardcode domains like `'backend.dev.localhost'` in chart code
- Duplicate values across dev/prod sections
- Bypass CONFIG and use environment variables in chart code
- Forget to run `npm run synth` after changing config

## Verification

After changing config, verify the generated manifests:

```bash
# Check namespace
grep "kind: Namespace" -A 3 dist/seance.k8s.yaml

# Check ingress hosts
grep "host:" dist/seance.k8s.yaml

# Check image tags
grep "image:" dist/seance.k8s.yaml

# Check replicas
grep "replicas:" dist/seance.k8s.yaml
```

Dev should show `dev.localhost` domains, prod should show `seance.dev` domains.

## Example: Deploy to Production

1. Edit `src/config.ts`:
   ```typescript
   export const ENVIRONMENT: DeploymentEnvironment = 'prod';
   ```

2. Regenerate manifests:
   ```bash
   npm run synth
   ```

3. Review the diff:
   ```bash
   git diff dist/seance.k8s.yaml
   ```

4. Apply to cluster:
   ```bash
   kubectl apply -f dist/seance.k8s.yaml
   ```

All domains, replicas, images, and settings automatically update for production.
