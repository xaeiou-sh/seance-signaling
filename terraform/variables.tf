# Terraform variables

variable "server_name" {
  description = "Droplet name"
  type        = string
  default     = "seance-backend"
}

variable "droplet_size" {
  description = "Droplet size"
  type        = string
  default     = "s-1vcpu-1gb"  # $6/month
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
