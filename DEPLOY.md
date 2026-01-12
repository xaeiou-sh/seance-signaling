# Deployment Guide

Deploy Seance backend to DigitalOcean with NixOS using OpenTofu + nixos-anywhere.

## Prerequisites

**1. Tools:**

Already included in devenv (opentofu). Just ensure you're in the devenv shell:
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

### Step 3: Deploy Everything

```bash
tofu init
tofu apply
```

This single command:
1. Creates DigitalOcean droplet (Ubuntu)
2. Configures firewall
3. Installs NixOS over Ubuntu (via nixos-anywhere)
4. Configures system (docker, devenv, etc)
5. Clones repo and starts services
6. Creates DNS records

Takes ~10 minutes. Watch the output for progress.

Wait 2-3 minutes for DNS to propagate:
```bash
dig backend.seance.dev +short  # Should return server IP
```

### Step 4: Verify

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
# Default profile: CADDY_DOMAIN=localhost:8080
```

**Production (NixOS):**
```bash
devenv --profile prod up
# Prod profile: CADDY_DOMAIN=backend.seance.dev
```

**Configuration:**
- `nix/nixos-configuration.nix` - NixOS system config (packages, services, firewall)
- `nix/disko-config.nix` - Disk partitioning
- `devenv.nix` - App environment (same locally and prod)
- `flake.nix` - Nix flake tying it together

**Zero drift** - NixOS ensures system is identical to config. devenv ensures app runs the same.

## Maintenance

### Update Code

```bash
ssh root@<SERVER_IP>
cd /opt/seance-signaling
git pull
systemctl restart seance-backend
```

### Update System Config

Edit `nix/nixos-configuration.nix`, then:
```bash
cd terraform
tofu apply  # Rebuilds and deploys NixOS
```

### View Logs

```bash
ssh root@<SERVER_IP>
journalctl -u seance-backend -f
```

### Scale Server

Edit `terraform/terraform.tfvars`:
```hcl
droplet_size = "s-2vcpu-2gb"  # $18/month
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

**NixOS installation fails:**
```bash
# Check tofu output for errors
# SSH may take a minute after reboot
# Try again: tofu apply
```

## Architecture

```
NixOS (declarative OS)
  └── configuration.nix declares:
      ├── Packages: git, docker, devenv
      ├── Services: docker, sshd
      ├── Firewall: 22, 80, 443, 4444
      └── systemd service: seance-backend
          └── Runs: devenv --profile prod up

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

## Advantages Over Ubuntu + Ansible

**Before (Ubuntu + Ansible):**
- Ubuntu base image (~100 packages you don't control)
- Ansible installs Nix (complex, error-prone)
- Ansible installs Docker, devenv
- ~100 lines of YAML
- State can drift over time

**Now (NixOS):**
- NixOS base (minimal, declarative)
- Nix built-in (it's the OS)
- Declare packages in configuration.nix
- ~60 lines of Nix
- Cannot drift (system matches config)
- Atomic rollbacks if something breaks

## Cost

- Droplet: $6/month (1GB) or $18/month (2GB)
- Bandwidth: 1TB included

**Total: $6-18/month**
