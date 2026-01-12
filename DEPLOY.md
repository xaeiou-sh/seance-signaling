# Deployment Guide

Deploy Seance backend to a DigitalOcean droplet using Terraform + Ansible.

## Prerequisites

**1. Tools:**
```bash
brew install terraform ansible
```

**2. DigitalOcean API Token:**
```bash
# Get token from: https://cloud.digitalocean.com/account/api/tokens
export DIGITALOCEAN_TOKEN=your_token_here
```

**3. SSH Key:**
```bash
# Generate if needed
ssh-keygen -t ed25519 -C "seance-deploy"

# Get public key
cat ~/.ssh/id_ed25519.pub
```

## Deploy

### Step 1: Configure Terraform

```bash
cd terraform

# Create config file
cat > terraform.tfvars <<EOF
ssh_public_key = "ssh-ed25519 AAAAC3Nza... your-key-here"
server_name    = "seance-backend"
droplet_size   = "s-1vcpu-2gb"  # $18/month
region         = "sfo3"          # or nearest region
EOF
```

### Step 2: Create Server

```bash
terraform init
terraform apply
```

Copy the server IP from output.

### Step 3: Update DNS

Add A records to your DNS provider:
```
backend.seance.dev  A  <SERVER_IP>
app.seance.dev      A  <SERVER_IP>
```

Wait 5 minutes for DNS propagation:
```bash
dig backend.seance.dev +short  # Should return SERVER_IP
```

### Step 4: Configure Server

Terraform auto-generated `../ansible/inventory.yml`.

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
terraform apply
```

### Destroy

```bash
cd terraform
terraform destroy
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
