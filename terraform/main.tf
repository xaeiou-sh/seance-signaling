terraform {
  required_version = ">= 1.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# Configure DigitalOcean provider
# Set DIGITALOCEAN_TOKEN environment variable
provider "digitalocean" {}

# Configure Cloudflare provider
# Set CLOUDFLARE_API_TOKEN environment variable
provider "cloudflare" {}

# SSH key for server access
resource "digitalocean_ssh_key" "default" {
  name       = "seance-deploy-key"
  public_key = var.ssh_public_key
}

# Create the droplet
resource "digitalocean_droplet" "seance_backend" {
  name        = var.server_name
  image       = "ubuntu-24-04-x64"
  size        = var.droplet_size
  region      = var.region
  ssh_keys    = [digitalocean_ssh_key.default.fingerprint]
  resize_disk = true

  tags = ["seance", "backend"]
}

# Firewall configuration
resource "digitalocean_firewall" "seance" {
  name        = "seance-firewall"
  droplet_ids = [digitalocean_droplet.seance_backend.id]

  # SSH
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTP
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # WebRTC Signaling
  inbound_rule {
    protocol         = "tcp"
    port_range       = "4444"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Allow all outbound
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# Auto-generate Ansible inventory
resource "local_file" "ansible_inventory" {
  content = templatefile("${path.module}/templates/inventory.yml.tpl", {
    server_ip   = digitalocean_droplet.seance_backend.ipv4_address
    server_name = digitalocean_droplet.seance_backend.name
  })
  filename = "${path.module}/../ansible/inventory.yml"
}

# Cloudflare DNS records
resource "cloudflare_record" "backend" {
  zone_id = var.cloudflare_zone_id
  name    = "backend"
  content = digitalocean_droplet.seance_backend.ipv4_address
  type    = "A"
  ttl     = 1  # Auto TTL
  proxied = false
}

resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = "app"
  content = digitalocean_droplet.seance_backend.ipv4_address
  type    = "A"
  ttl     = 1  # Auto TTL
  proxied = false
}
