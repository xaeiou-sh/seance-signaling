# Terraform outputs

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
