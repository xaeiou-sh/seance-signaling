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

provider "digitalocean" {}
provider "cloudflare" {}

# SSH key for server access
resource "digitalocean_ssh_key" "default" {
  name       = "seance-deploy-key"
  public_key = var.ssh_public_key
}

# Create Ubuntu 24.04 droplet
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

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "4444"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

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

# Cloudflare DNS records
resource "cloudflare_record" "backend" {
  zone_id = var.cloudflare_zone_id
  name    = "backend"
  content = digitalocean_droplet.seance_backend.ipv4_address
  type    = "A"
  ttl     = 1
  proxied = false
}

resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = "app"
  content = digitalocean_droplet.seance_backend.ipv4_address
  type    = "A"
  ttl     = 1
  proxied = false
}

resource "cloudflare_record" "root" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  content = digitalocean_droplet.seance_backend.ipv4_address
  type    = "A"
  ttl     = 1
  proxied = false
}

resource "cloudflare_record" "auth" {
  zone_id = var.cloudflare_zone_id
  name    = "auth"
  content = digitalocean_droplet.seance_backend.ipv4_address
  type    = "A"
  ttl     = 1
  proxied = false
}

# Generate Ansible inventory automatically
resource "local_file" "ansible_inventory" {
  content = templatefile("${path.module}/ansible/inventory.yml.tpl", {
    server_ip = digitalocean_droplet.seance_backend.ipv4_address
  })
  filename = "${path.module}/ansible/inventory.yml"
}

# Variables
variable "server_name" {
  description = "Droplet name"
  type        = string
  default     = "seance-backend"
}

variable "droplet_size" {
  description = "Droplet size"
  type        = string
  default     = "s-1vcpu-2gb"  # $6/month
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "sfo3"
}

variable "ssh_public_key" {
  description = "SSH public key for server access"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for seance.dev"
  type        = string
}

# Outputs
output "server_ip" {
  description = "Server IP address"
  value       = digitalocean_droplet.seance_backend.ipv4_address
}

output "backend_domain" {
  description = "Backend domain (DNS configured)"
  value       = cloudflare_record.backend.hostname
}

output "app_domain" {
  description = "App domain (DNS configured)"
  value       = cloudflare_record.app.hostname
}

output "root_domain" {
  description = "Root domain (DNS configured)"
  value       = cloudflare_record.root.hostname
}

output "auth_domain" {
  description = "Auth domain (DNS configured)"
  value       = cloudflare_record.auth.hostname
}
