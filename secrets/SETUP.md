# SOPS Setup Guide

Quick start guide for setting up SOPS encryption.

## One-Time Setup (5 minutes)

### 1. Install SOPS

```bash
nix-env -iA nixpkgs.sops
```

Verify installation:
```bash
sops --version
```

### 2. Generate Age Key

```bash
mkdir -p "$HOME/Library/Application Support/sops/age"
age-keygen -o "$HOME/Library/Application Support/sops/age/keys.txt"
chmod 600 "$HOME/Library/Application Support/sops/age/keys.txt"
```

Example output:
```
# created: 2026-01-24T...
# public key: age1abc123...xyz
AGE-SECRET-KEY-1ABC123...XYZ
```

**Save the public key** (starts with `age1...`) - you'll need it for the next step.

### 3. Update .sops.yaml

Edit `secrets/.sops.yaml` and replace the placeholder public key:

```yaml
creation_rules:
  - path_regex: secrets\.yaml$
    age: age1abc123...xyz  # Your public key from step 2
```

### 4. Encrypt Secrets File

The `secrets.yaml` file should already exist with production secrets.
If you need to re-encrypt or start fresh:

```bash
cd secrets
sops -e -i secrets.yaml
```

### 5. Test

```bash
# View decrypted secrets
sops -d secrets.yaml

# Or use the helper script
cd ..
source scripts/decrypt-secrets.sh
echo "STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:0:20}..."
```

## Done!

Your secrets are now:
- ✅ Encrypted with age
- ✅ Safe to commit to git
- ✅ Automatically decrypted by deployment scripts

## Team Onboarding

Share the age private key securely (1Password, Bitwarden, etc.):

**For new team member:**
1. Get `keys.txt` from password manager
2. Save to `~/Library/Application Support/sops/age/keys.txt` (macOS)
3. Set permissions: `chmod 600 ~/Library/Application\ Support/sops/age/keys.txt`
4. Test: `sops -d secrets/secrets.yaml`

**Security note:** Restrict access to the production key to authorized personnel only.

## Editing Secrets

To update secrets:

```bash
sops secrets/secrets.yaml
# Edit in your $EDITOR
# Save and exit - auto-re-encrypts
```

## Troubleshooting

**"no age key found"**
- Check file exists: `ls ~/Library/Application\ Support/sops/age/keys.txt`
- Check permissions: `ls -l ~/Library/Application\ Support/sops/age/keys.txt`
- Verify public key in `.sops.yaml` matches your key

**"MAC mismatch"**
- File was encrypted with different key
- Get correct private key from team

**"failed to decrypt"**
- File not encrypted yet: run `sops -e -i secrets/secrets.yaml`
- Wrong key: verify public key in `.sops.yaml`
- Missing SOPS_AGE_KEY_FILE: decrypt script sets this automatically
