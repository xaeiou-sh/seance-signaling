# Deployment Guide

Deploy Seance backend to a DigitalOcean droplet using OpenTofu + Ansible.

## Prerequisites

**1. Tools:**

Already included in devenv (opentofu, ansible). Just ensure you're in the devenv shell:
```bash
devenv shell
```

**2. DigitalOcean API Token:**
```bash
# Get token from: https://cloud.digitalocean.com/account/api/tokens
export DIGITALOCEAN_TOKEN=your_token_here
```

**3. Cloudflare API Token:**
```bash
# Get token from: https://dash.cloudflare.com/profile/api-tokens
# Click "Create Token" → "Edit zone DNS" template
# Select your seance.dev zone
export CLOUDFLARE_API_TOKEN=your_token_here
```

**4. SSH Key:**
```bash
# Generate if needed
ssh-keygen -t ed25519 -C "seance-deploy"

# Get public key
cat ~/.ssh/id_ed25519.pub
```

## Deploy

### Step 1: Get Cloudflare Zone ID

```bash
# Find your zone ID at: https://dash.cloudflare.com/
# Click on seance.dev domain → Overview → Copy Zone ID from right sidebar
```

### Step 2: Configure OpenTofu

```bash
cd terraform

# Create config file
cat > terraform.tfvars <<EOF
ssh_public_key     = "ssh-ed25519 AAAAC3Nza... your-key-here"
cloudflare_zone_id = "your_zone_id_here"
server_name        = "seance-backend"
droplet_size       = "s-1vcpu-1gb"  # $6/month
region             = "sfo3"          # or nearest region
EOF
```

### Step 3: Provision Infrastructure

```bash
tofu init
tofu apply
```

This creates:
- DigitalOcean droplet
- Firewall rules
- DNS records (backend.seance.dev, app.seance.dev)
- Ansible inventory

Wait 2-3 minutes for DNS to propagate:
```bash
dig backend.seance.dev +short  # Should return server IP
```

### Step 4: Configure Server

OpenTofu auto-generated `../ansible/inventory.yml`.

```bash
cd ../ansible

# Test connection
ansible all -i inventory.yml -m ping

# Deploy (takes ~5 minutes)
ansible-playbook -i inventory.yml playbook.yml
```

This installs: Nix, devenv, Docker, clones repo, starts services.

### Step 5: Verify

```bash
# Check service
ssh root@<SERVER_IP> systemctl status seance-backend

# View logs
ssh root@<SERVER_IP> journalctl -u seance-backend -f

# Test endpoints
curl https://backend.seance.dev/
curl https://backend.seance.dev/ui  # Swagger
```

## How It Works

**Local (dev):**
```bash
devenv up
# Runs with default profile
# CADDY_DOMAIN=localhost:8080
```

**Production:**
```bash
devenv --profile prod up
# Uses prod profile from devenv.nix
# CADDY_DOMAIN=backend.seance.dev
# APP_DOMAIN=app.seance.dev
```

**Zero drift** - same devenv.nix, different profile.

## Maintenance

### Update Code

```bash
ssh root@<SERVER_IP>
cd /opt/seance-signaling
git pull
systemctl restart seance-backend
```

### View Logs

```bash
ssh root@<SERVER_IP>
journalctl -u seance-backend -f
```

### Scale Server

Edit `terraform/terraform.tfvars`:
```hcl
droplet_size = "s-2vcpu-4gb"  # $36/month
```

Apply:
```bash
cd terraform
tofu apply
```

### Destroy

```bash
cd terraform
tofu destroy
```

## Troubleshooting

**"Connection refused" from GitHub Actions:**
```bash
ssh root@<SERVER_IP>
journalctl -u seance-backend -xe
curl localhost:3000  # Test backend directly
```

**"Invalid builder key":**
- Check `config.yml` has correct hash
- Verify GitHub secret `BUILDER_KEY` is set
- Test: `echo -n "KEY" | shasum -a 256`

**DNS not resolving:**
```bash
dig backend.seance.dev +short
# If empty, check DNS provider or wait longer
```

## Architecture

```
devenv.nix (same everywhere)
  ├── Default profile (dev)
  │   └── CADDY_DOMAIN=localhost:8080
  └── Prod profile
      ├── CADDY_DOMAIN=backend.seance.dev
      └── APP_DOMAIN=app.seance.dev

Services:
  ├── Backend (Hono, port 3000)
  ├── Signaling (Docker, port 4444)
  └── Caddy (HTTPS :443 → 3000)
```

## Cost

- Droplet: $18/month
- Bandwidth: 1TB included

**Total: $18/month**
