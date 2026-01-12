# Terraform variables

variable "server_name" {
  description = "Droplet name"
  type        = string
  default     = "seance-backend"
}

variable "droplet_size" {
  description = "Droplet size"
  type        = string
  default     = "s-1vcpu-2gb"  # $18/month
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
