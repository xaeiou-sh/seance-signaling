# Secrets Management (SOPS+age)

Secrets are encrypted with SOPS and age encryption for safe storage in git.

## Quick Start

**View secrets:**
```bash
sops secrets.yaml
```

**Edit secrets:**
```bash
sops secrets.yaml
# Your $EDITOR opens with decrypted content
# Save and exit - SOPS automatically re-encrypts
```

## Deployment

Secrets are managed separately from Kubernetes manifests for security:
- **Production**: `./scripts/deploy-production.sh` applies secrets via `kubectl` after deploying
- **Development**: `tilt up` applies secrets to local cluster automatically
- **Manifests**: Generated YAML files contain NO secret values - only references

Secrets are applied directly to Kubernetes using `kubectl create secret`, never stored in manifests!

## Files

- **`secrets.yaml`** - Encrypted secrets (safe to commit)
- **`.sops.yaml`** - SOPS configuration (defines which age key to use)
- **`~/Library/Application Support/sops/age/keys.txt`** - Your private age key (macOS default, never commit!)

## What's Encrypted

- `STRIPE_SECRET_KEY` - Stripe API secret key
- `STRIPE_PRICE_ID` - Stripe price/product ID

Builder key hashes are hardcoded in `backend-trpc/src/index.ts` (they're public hashes, not secrets).

## Adding New Secrets

1. Edit encrypted file:
   ```bash
   sops secrets.yaml
   ```

2. Add new key-value pair:
   ```yaml
   STRIPE_SECRET_KEY: sk_live_...
   STRIPE_PRICE_ID: price_...
   NEW_SECRET: value_here
   ```

3. Update `scripts/apply-secrets.sh` to include the new secret:
   ```bash
   NEW_SECRET=$(sops -d "$SECRETS_FILE" | grep "NEW_SECRET:" | cut -d':' -f2- | xargs)

   kubectl create secret generic seance-secrets \
     --from-literal=NEW_SECRET="$NEW_SECRET" \
     ...
   ```

4. Update `kubernetes/cdk8s/src/seance-chart.ts` to reference it:
   ```typescript
   NEW_SECRET: kplus.EnvValue.fromSecretValue({
     secret: appSecrets,
     key: 'NEW_SECRET',
   }),
   ```

5. Deploy - secrets applied directly to cluster via kubectl.

## Setup (One-Time)

See `SETUP.md` for initial setup instructions.

## Team Onboarding

New team members need the age private key:

1. Get `keys.txt` from password manager (1Password, Bitwarden, etc.)
2. Save to `~/Library/Application Support/sops/age/keys.txt` (macOS)
3. Set permissions: `chmod 600 ~/Library/Application\ Support/sops/age/keys.txt`
4. Test: `sops -d secrets/secrets.yaml`

## Security Improvements

**Before:**
- Secrets hardcoded in config.ts (visible in git)
- Secrets in plaintext in generated YAML
- Secrets visible in deployment specs

**After:**
- Secrets encrypted with age (safe in git)
- Secrets in Kubernetes Secret resources (base64 in etcd)
- Generated manifests safe to commit
- Secrets referenced via secretKeyRef (not in pod spec)

## Troubleshooting

**"no age key found"**
- Verify: `ls ~/Library/Application\ Support/sops/age/keys.txt`
- Fix permissions: `chmod 600 ~/Library/Application\ Support/sops/age/keys.txt`

**"MAC mismatch"**
- Wrong private key - get correct key from team

**Secrets not loading**
- Test: `source scripts/decrypt-secrets.sh`
- Verify: `echo $STRIPE_SECRET_KEY`
