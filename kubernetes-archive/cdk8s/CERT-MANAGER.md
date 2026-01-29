# cert-manager via cdk8s Helm Integration

cert-manager is fully managed through cdk8s using [Helm chart imports](https://cdk8s.io/docs/latest/basics/helm/). This means TLS certificate management is defined in TypeScript with type safety, and deployed as part of our infrastructure.

## How It Works

### 1. Helm Chart Import

We import the cert-manager Helm chart using cdk8s:

```bash
npx cdk8s import helm:https://charts.jetstack.io/cert-manager@v1.16.2
```

This generates `imports/cert-manager.ts` with a type-safe `Certmanager` construct.

### 2. Chart Definition

In `src/cert-manager-chart.ts`, we:

- Deploy cert-manager via the imported Helm construct
- Create a `selfsigned-issuer` ClusterIssuer for dev
- Include commented-out Let's Encrypt config for prod

### 3. Manifest Generation

When you run `npm run synth`, cdk8s:

1. Templates the Helm chart into raw Kubernetes YAML
2. Includes the ClusterIssuer resources
3. Outputs everything to `dist/cert-manager.k8s.yaml` (966K)

This is a **standard Kubernetes manifest** - no Helm required at deployment time.

### 4. Deployment

Tilt applies the generated manifest:

```python
# Tiltfile
k8s_yaml('./cdk8s/dist/cert-manager.k8s.yaml')
```

## Benefits vs Manual Installation

### Before (Manual)
```bash
# In setup.sh
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
kubectl apply -f cert-manager-issuer.yaml
```

**Problems**:
- Two separate files to manage
- Version pinned in shell script
- No type safety
- Helm values require separate YAML file

### After (cdk8s)
```typescript
// In src/cert-manager-chart.ts
new Certmanager(this, 'cert-manager', {
  namespace: 'cert-manager',
  values: {
    installCrDs: true,
    global: {
      leaderElection: {
        namespace: 'cert-manager',
      },
    },
  },
});
```

**Benefits**:
- Single source of truth in TypeScript
- Type-checked Helm values (autocomplete in IDE)
- Version tracked in one place
- ClusterIssuers defined alongside cert-manager
- Standard kubectl apply at deploy time
- No Helm required on deployment machine

## The Self-Signed Issuer

For local development, we create a self-signed ClusterIssuer:

```typescript
new ApiObject(this, 'selfsigned-issuer', {
  apiVersion: 'cert-manager.io/v1',
  kind: 'ClusterIssuer',
  metadata: {
    name: 'selfsigned-issuer',
  },
  spec: {
    selfSigned: {},
  },
});
```

This issuer is referenced in the Ingress:

```typescript
// In seance-chart.ts
ingress.metadata.annotations = {
  'cert-manager.io/cluster-issuer': CONFIG.tls.issuer,  // 'selfsigned-issuer'
};
```

When the Ingress is created, cert-manager automatically:
1. Sees the annotation
2. Creates a Certificate resource
3. Generates a self-signed cert
4. Stores it in the `seance-tls` Secret
5. Ingress uses the secret for TLS

## Production: Let's Encrypt

For production, uncomment the Let's Encrypt issuer in `cert-manager-chart.ts`:

```typescript
new ApiObject(this, 'letsencrypt-prod', {
  apiVersion: 'cert-manager.io/v1',
  kind: 'ClusterIssuer',
  metadata: {
    name: 'letsencrypt-prod',
  },
  spec: {
    acme: {
      server: 'https://acme-v02.api.letsencrypt.org/directory',
      email: 'your-email@seance.dev',
      privateKeySecretRef: {
        name: 'letsencrypt-prod',
      },
      solvers: [
        {
          http01: {
            ingress: {
              class: 'nginx',
            },
          },
        },
      ],
    },
  },
});
```

Then update `config.ts`:

```typescript
tls: {
  enabled: true,
  issuer: ENVIRONMENT === 'dev' ? 'selfsigned-issuer' : 'letsencrypt-prod',
}
```

cert-manager will:
1. Request real certs from Let's Encrypt
2. Solve HTTP-01 ACME challenges automatically
3. Renew certs before expiration
4. No browser warnings!

## Updating cert-manager Version

To upgrade cert-manager:

1. Re-import the new version:
   ```bash
   npx cdk8s import helm:https://charts.jetstack.io/cert-manager@v1.17.0
   ```

2. Regenerate manifests:
   ```bash
   npm run synth
   ```

3. Review the diff:
   ```bash
   git diff dist/cert-manager.k8s.yaml
   ```

4. Apply:
   ```bash
   kubectl apply -f dist/cert-manager.k8s.yaml
   ```

The imports directory is gitignored, so each developer regenerates it during setup.

## Customizing Helm Values

All [cert-manager Helm values](https://artifacthub.io/packages/helm/cert-manager/cert-manager) are available with type safety:

```typescript
new Certmanager(this, 'cert-manager', {
  values: {
    installCrDs: true,

    // Replica counts
    replicaCount: 2,
    webhook: {
      replicaCount: 2,
    },
    cainjector: {
      replicaCount: 2,
    },

    // Resource limits
    resources: {
      requests: {
        cpu: '100m',
        memory: '128Mi',
      },
      limits: {
        cpu: '1000m',
        memory: '512Mi',
      },
    },

    // Prometheus monitoring
    prometheus: {
      enabled: true,
      servicemonitor: {
        enabled: true,
      },
    },
  },
});
```

Your IDE will autocomplete available fields!

## Troubleshooting

### cert-manager pods not starting

```bash
kubectl get pods -n cert-manager
kubectl logs -n cert-manager deploy/cert-manager
```

### Certificate not being issued

```bash
# Check Certificate resource
kubectl get certificate -n seance

# Check CertificateRequest
kubectl get certificaterequest -n seance

# Check cert-manager logs
kubectl logs -n cert-manager deploy/cert-manager | grep seance-tls
```

### Regenerate imports

If imports get corrupted:

```bash
rm -rf imports/
npx cdk8s import helm:https://charts.jetstack.io/cert-manager@v1.16.2
npm run synth
```

## References

- [cdk8s Helm Support](https://cdk8s.io/docs/latest/basics/helm/)
- [cert-manager Helm Chart](https://artifacthub.io/packages/helm/cert-manager/cert-manager)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [AWS: cdk8s Helm Integration Announcement](https://aws.amazon.com/about-aws/whats-new/2023/10/cdk8s-synthesize-import-helm-charts-cloud-tokens/)
