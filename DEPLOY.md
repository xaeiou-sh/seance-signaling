# Deployment Guide

Deploy Seance backend to DigitalOcean using Fedora + OpenTofu + Ansible.

## Prerequisites

**1. Tools:**

OpenTofu and Ansible are included in devenv:
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
1. DigitalOcean Fedora 40 droplet
2. Firewall (ports 22, 80, 443, 4444)
3. Cloudflare DNS records (backend.seance.dev, app.seance.dev)

Wait for DNS to propagate (2-3 minutes):
```bash
dig backend.seance.dev +short  # Should return server IP
```

### Step 4: Create Ansible Inventory

```bash
cat > ansible/inventory.yml <<EOF
all:
  hosts:
    seance:
      ansible_host: <SERVER_IP_FROM_TOFU_OUTPUT>
      ansible_user: root
      ansible_ssh_private_key_file: ~/.ssh/id_ed25519
EOF
```

### Step 5: Run Ansible Playbook

```bash
ansible-playbook -i ansible/inventory.yml ansible/playbook.yml
```

This configures:
1. Installs system packages (git, curl, zellij)
2. Installs Nix and devenv
3. Installs Docker
4. Clones repository to /opt/seance-signaling
5. Creates systemd service that runs devenv in Zellij session

### Step 6: Verify

```bash
# Check service status
ssh root@<SERVER_IP> systemctl status seance-backend

# Attach to Zellij session to see live output
ssh root@<SERVER_IP>
zellij attach seance-production

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

**Production (Fedora + Zellij):**
- systemd service runs: `zellij --session seance-production --daemon -- devenv --profile prod up`
- You can attach anytime: `ssh root@server`, then `zellij attach seance-production`
- See real-time logs and debug interactively
- Press Ctrl+C to restart, or just detach (Ctrl+O, d) to leave running

**Configuration:**
- `main.tf` - OpenTofu infrastructure (droplet, firewall, DNS)
- `ansible/playbook.yml` - Server configuration (Nix, devenv, Docker, Zellij)
- `devenv.nix` - App environment (same locally and prod)
- `terraform.tfvars` - Your deployment variables (gitignored)

**Zero drift** - Same devenv.nix everywhere. Zellij gives you visibility.

## Maintenance

### Debug Issues

```bash
# SSH in and attach to Zellij session
ssh root@<SERVER_IP>
zellij attach seance-production

# See everything in real-time
# Press Ctrl+O, d to detach without stopping
```

### Update Code

```bash
ssh root@<SERVER_IP>
cd /opt/seance-signaling
git pull
systemctl restart seance-backend
```

### View Logs (systemd)

```bash
ssh root@<SERVER_IP>
journalctl -u seance-backend -f
```

### Manual Restart

```bash
# Attach to session, Ctrl+C to stop, then restart
ssh root@<SERVER_IP>
zellij attach seance-production
# Ctrl+C
# Up arrow, Enter to restart devenv
```

### Update Server Config

Edit `ansible/playbook.yml`, then:
```bash
ansible-playbook -i ansible/inventory.yml ansible/playbook.yml
```

### Scale Server

Edit `terraform.tfvars`:
```hcl
droplet_size = "s-2vcpu-2gb"  # $18/month
```

Apply:
```bash
tofu apply
```

### Destroy

```bash
tofu destroy
```

## Troubleshooting

**"Connection refused" from GitHub Actions:**
```bash
# Attach to Zellij and see what's happening
ssh root@<SERVER_IP>
zellij attach seance-production
```

**"Invalid builder key":**
- Check `config.yml` has correct hash
- Verify GitHub secret `BUILDER_KEY` is set
- Test: `echo -n "KEY" | shasum -a 256`

**DNS not resolving:**
```bash
dig backend.seance.dev +short
# If empty, check Cloudflare or wait longer
```

**Service won't start:**
```bash
ssh root@<SERVER_IP>
journalctl -u seance-backend -xe
```

## Architecture

```
Fedora 40 (DigitalOcean)
  ├── System packages (git, docker, zellij)
  ├── Nix (multi-user install)
  ├── devenv (via Nix)
  └── systemd service: seance-backend
      └── Zellij session: seance-production
          └── bash: devenv --profile prod up
              ├── Backend (Hono, port 3000)
              ├── Signaling (Docker, port 4444)
              └── Caddy (HTTPS :443 → 3000)

devenv.nix profiles:
  ├── Default (dev): CADDY_DOMAIN=localhost:8080
  └── Prod: CADDY_DOMAIN=backend.seance.dev

Cloudflare DNS:
  ├── backend.seance.dev → Server IP
  └── app.seance.dev → Server IP
```

## Why This Setup?

**Debuggability:**
- Attach to Zellij session anytime to see what's happening
- No digging through journalctl logs
- Interactive debugging when things go wrong

**Simplicity:**
- Fedora is mainstream and well-documented
- Up-to-date packages (newer than Ubuntu LTS)
- Ansible is straightforward and battle-tested
- No complex NixOS cross-compilation issues

**Same Environment:**
- devenv.nix ensures local and prod are identical
- Profiles handle the few differences (domains)
- No drift between environments

## Cost

- Droplet: $6/month (1GB) or $18/month (2GB)
- Bandwidth: 1TB included

**Total: $6-18/month**
