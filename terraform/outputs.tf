# Terraform outputs

output "server_ip" {
  description = "Server IP address"
  value       = digitalocean_droplet.seance_backend.ipv4_address
}
