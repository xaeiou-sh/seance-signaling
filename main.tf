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
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

provider "digitalocean" {}
provider "cloudflare" {}

# ============================================================================
# DIGITALOCEAN KUBERNETES CLUSTER
# ============================================================================

resource "digitalocean_kubernetes_cluster" "seance" {
  name    = "seance-production"
  region  = var.region
  version = var.kubernetes_version

  # Node pool configuration
  node_pool {
    name       = "worker-pool"
    size       = var.node_size
    auto_scale = true
    min_nodes  = var.min_nodes
    max_nodes  = var.max_nodes
  }

  # High availability control plane (optional, adds ~$40/month)
  ha = false

  # Auto-upgrade for patch releases during maintenance window
  auto_upgrade = true

  tags = ["seance", "production"]
}

# Write kubeconfig to local file for kubectl access
resource "local_file" "kubeconfig" {
  content  = digitalocean_kubernetes_cluster.seance.kube_config[0].raw_config
  filename = "${path.module}/.kube/config"
}

# Configure Kubernetes provider to use the cluster
provider "kubernetes" {
  host  = digitalocean_kubernetes_cluster.seance.endpoint
  token = digitalocean_kubernetes_cluster.seance.kube_config[0].token
  cluster_ca_certificate = base64decode(
    digitalocean_kubernetes_cluster.seance.kube_config[0].cluster_ca_certificate
  )
}

provider "helm" {
  kubernetes {
    host  = digitalocean_kubernetes_cluster.seance.endpoint
    token = digitalocean_kubernetes_cluster.seance.kube_config[0].token
    cluster_ca_certificate = base64decode(
      digitalocean_kubernetes_cluster.seance.kube_config[0].cluster_ca_certificate
    )
  }
}

# ============================================================================
# NGINX INGRESS CONTROLLER
# ============================================================================

# Install nginx-ingress-controller via Helm
# This creates a DigitalOcean LoadBalancer automatically
resource "helm_release" "nginx_ingress" {
  name             = "nginx-ingress"
  repository       = "https://kubernetes.github.io/ingress-nginx"
  chart            = "ingress-nginx"
  namespace        = "ingress-nginx"
  create_namespace = true

  # Wait for LoadBalancer to get external IP
  wait    = true
  timeout = 600 # 10 minutes

  set {
    name  = "controller.service.type"
    value = "LoadBalancer"
  }

  # Use DO LoadBalancer annotations
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/do-loadbalancer-name"
    value = "seance-lb"
  }

  depends_on = [digitalocean_kubernetes_cluster.seance]
}

# Get the LoadBalancer IP address
data "kubernetes_service" "nginx_ingress" {
  metadata {
    name      = "nginx-ingress-ingress-nginx-controller"
    namespace = "ingress-nginx"
  }

  depends_on = [helm_release.nginx_ingress]
}

# ============================================================================
# DEPLOY KUBERNETES MANIFESTS
# ============================================================================

# Apply Kubernetes manifests using shared script
# This ensures dev and prod use identical deployment logic
resource "null_resource" "apply_manifests" {
  triggers = {
    cert_manager_sha = filesha256("${path.module}/kubernetes/cdk8s/dist/cert-manager.k8s.yaml")
    seance_sha       = filesha256("${path.module}/kubernetes/cdk8s/dist/seance.k8s.yaml")
  }

  provisioner "local-exec" {
    command = <<-EOT
      export KUBECONFIG=${path.module}/.kube/config
      export WAIT_TIMEOUT=300
      ${path.module}/kubernetes/apply-manifests.sh

      # Wait for deployments to be ready
      kubectl wait --for=condition=available --timeout=300s \
        deployment/backend deployment/landing deployment/signaling deployment/valkey \
        -n seance-prod
    EOT
  }

  depends_on = [
    digitalocean_kubernetes_cluster.seance,
    local_file.kubeconfig,
    helm_release.nginx_ingress,
  ]
}

# ============================================================================
# CLOUDFLARE DNS RECORDS
# ============================================================================

# Point all domains to the LoadBalancer IP
resource "cloudflare_record" "backend" {
  zone_id = var.cloudflare_zone_id
  name    = "backend"
  content = data.kubernetes_service.nginx_ingress.status[0].load_balancer[0].ingress[0].ip
  type    = "A"
  ttl     = 1
  proxied = false
}

resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = "app"
  content = data.kubernetes_service.nginx_ingress.status[0].load_balancer[0].ingress[0].ip
  type    = "A"
  ttl     = 1
  proxied = false
}

resource "cloudflare_record" "root" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  content = data.kubernetes_service.nginx_ingress.status[0].load_balancer[0].ingress[0].ip
  type    = "A"
  ttl     = 1
  proxied = false
}

resource "cloudflare_record" "auth" {
  zone_id = var.cloudflare_zone_id
  name    = "auth"
  content = data.kubernetes_service.nginx_ingress.status[0].load_balancer[0].ingress[0].ip
  type    = "A"
  ttl     = 1
  proxied = false
}

resource "cloudflare_record" "litellm" {
  zone_id = var.cloudflare_zone_id
  name    = "litellm"
  content = data.kubernetes_service.nginx_ingress.status[0].load_balancer[0].ingress[0].ip
  type    = "A"
  ttl     = 1
  proxied = false
}

# ============================================================================
# VARIABLES
# ============================================================================

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "sfo3"
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.33.1-do.5" # Latest as of Jan 2026
}

variable "node_size" {
  description = "Droplet size for worker nodes"
  type        = string
  default     = "s-2vcpu-4gb" # $24/month per node
}

variable "min_nodes" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 2
}

variable "max_nodes" {
  description = "Maximum number of worker nodes (autoscaling)"
  type        = number
  default     = 5
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for seance.dev"
  type        = string
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "cluster_id" {
  description = "DOKS cluster ID"
  value       = digitalocean_kubernetes_cluster.seance.id
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint"
  value       = digitalocean_kubernetes_cluster.seance.endpoint
}

output "loadbalancer_ip" {
  description = "LoadBalancer external IP"
  value       = data.kubernetes_service.nginx_ingress.status[0].load_balancer[0].ingress[0].ip
}

output "backend_domain" {
  description = "Backend domain"
  value       = cloudflare_record.backend.hostname
}

output "app_domain" {
  description = "App domain"
  value       = cloudflare_record.app.hostname
}

output "root_domain" {
  description = "Root domain"
  value       = cloudflare_record.root.hostname
}

output "auth_domain" {
  description = "Auth domain"
  value       = cloudflare_record.auth.hostname
}

output "litellm_domain" {
  description = "LiteLLM domain"
  value       = cloudflare_record.litellm.hostname
}

output "kubeconfig_path" {
  description = "Path to kubeconfig file"
  value       = local_file.kubeconfig.filename
}
