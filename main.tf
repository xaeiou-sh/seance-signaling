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
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.6.0"
    }
  }
}

provider "digitalocean" {}
provider "cloudflare" {}
provider "railway" {}

# ============================================================================
# VARIABLES
# ============================================================================

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for seance.dev"
  type        = string
}

variable "git_commit" {
  description = "Git commit hash for Docker image tags"
  type        = string
  default     = "latest"
}

variable "environment" {
  description = "Environment name (prod or dev) - used as Spaces path prefix"
  type        = string
  default     = "prod"
}

# ============================================================================
# DIGITALOCEAN SPACES (Object Storage)
# ============================================================================

resource "digitalocean_spaces_bucket" "seance_cdn" {
  name   = "seance-cdn"
  region = "sfo3"
}

# Separate CORS configuration (recommended approach)
resource "digitalocean_spaces_bucket_cors_configuration" "seance_cdn" {
  bucket = digitalocean_spaces_bucket.seance_cdn.id
  region = digitalocean_spaces_bucket.seance_cdn.region

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    max_age_seconds = 3600
  }
}

# ============================================================================
# RAILWAY PROJECT & SERVICES
# ============================================================================

# Main Railway project
resource "railway_project" "seance" {
  name = "seance-production"
}

# Production environment
resource "railway_environment" "production" {
  name       = "production"
  project_id = railway_project.seance.id
}

# Backend service
resource "railway_service" "backend" {
  name       = "backend"
  project_id = railway_project.seance.id

  source {
    image = "fractalhuman1/seance-backend:${var.git_commit}"
  }
}

# Backend environment variables
resource "railway_variable" "backend_port" {
  environment_id = railway_environment.production.id
  service_id     = railway_service.backend.id
  name           = "PORT"
  value          = "8765"
}

resource "railway_variable" "backend_redis_host" {
  environment_id = railway_environment.production.id
  service_id     = railway_service.backend.id
  name           = "REDIS_HOST"
  value          = railway_service.valkey.id  # Railway internal service reference
}

resource "railway_variable" "backend_redis_port" {
  environment_id = railway_environment.production.id
  service_id     = railway_service.backend.id
  name           = "REDIS_PORT"
  value          = "6379"
}

# Secrets for backend (loaded from SOPS via separate script)
# These will be injected via railway-deploy.sh using Railway CLI
# Cannot use Terraform because secrets are encrypted in SOPS

# Landing page service
resource "railway_service" "landing" {
  name       = "landing"
  project_id = railway_project.seance.id

  source {
    image = "fractalhuman1/seance-landing:${var.git_commit}"
  }
}

resource "railway_variable" "landing_port" {
  environment_id = railway_environment.production.id
  service_id     = railway_service.landing.id
  name           = "PORT"
  value          = "80"
}

# Signaling server (WebRTC)
resource "railway_service" "signaling" {
  name       = "signaling"
  project_id = railway_project.seance.id

  source {
    image = "funnyzak/y-webrtc-signaling:latest"
  }
}

resource "railway_variable" "signaling_port" {
  environment_id = railway_environment.production.id
  service_id     = railway_service.signaling.id
  name           = "PORT"
  value          = "4444"
}

# Valkey (Redis) service
resource "railway_service" "valkey" {
  name       = "valkey"
  project_id = railway_project.seance.id

  source {
    image = "valkey/valkey:latest"
  }
}

resource "railway_variable" "valkey_port" {
  environment_id = railway_environment.production.id
  service_id     = railway_service.valkey.id
  name           = "PORT"
  value          = "6379"
}

# LiteLLM service - custom image with built-in config
resource "railway_service" "litellm" {
  name       = "litellm"
  project_id = railway_project.seance.id

  source {
    image = "fractalhuman1/seance-litellm:${var.git_commit}"
  }
}

resource "railway_variable" "litellm_port" {
  environment_id = railway_environment.production.id
  service_id     = railway_service.litellm.id
  name           = "PORT"
  value          = "4000"
}

# Beholder (PostHog proxy) - custom nginx image with built-in config
resource "railway_service" "beholder" {
  name       = "beholder"
  project_id = railway_project.seance.id

  source {
    image = "fractalhuman1/seance-beholder:${var.git_commit}"
  }
}

resource "railway_variable" "beholder_port" {
  environment_id = railway_environment.production.id
  service_id     = railway_service.beholder.id
  name           = "PORT"
  value          = "80"
}

# ============================================================================
# CUSTOM DOMAINS
# ============================================================================

# Backend domain
resource "railway_custom_domain" "backend" {
  service_id = railway_service.backend.id
  domain     = "backend.seance.dev"
}

# Landing domain (root)
resource "railway_custom_domain" "landing" {
  service_id = railway_service.landing.id
  domain     = "seance.dev"
}

# Signaling domain
resource "railway_custom_domain" "signaling" {
  service_id = railway_service.signaling.id
  domain     = "signaling.seance.dev"
}

# Beholder domain
resource "railway_custom_domain" "beholder" {
  service_id = railway_service.beholder.id
  domain     = "beholder.seance.dev"
}

# LiteLLM domain
resource "railway_custom_domain" "litellm" {
  service_id = railway_service.litellm.id
  domain     = "litellm.seance.dev"
}

# ============================================================================
# RAILWAY CLI DATA SOURCES (Get CNAMEs)
# ============================================================================

# Get CNAME for backend
data "external" "backend_cname" {
  program = ["bash", "-c", <<-EOF
    railway domain get backend.seance.dev --json 2>/dev/null | jq -r '{cname: .target}' || echo '{"cname": "pending"}'
  EOF
  ]

  depends_on = [railway_custom_domain.backend]
}

# Get CNAME for landing
data "external" "landing_cname" {
  program = ["bash", "-c", <<-EOF
    railway domain get seance.dev --json 2>/dev/null | jq -r '{cname: .target}' || echo '{"cname": "pending"}'
  EOF
  ]

  depends_on = [railway_custom_domain.landing]
}

# Get CNAME for signaling
data "external" "signaling_cname" {
  program = ["bash", "-c", <<-EOF
    railway domain get signaling.seance.dev --json 2>/dev/null | jq -r '{cname: .target}' || echo '{"cname": "pending"}'
  EOF
  ]

  depends_on = [railway_custom_domain.signaling]
}

# Get CNAME for beholder
data "external" "beholder_cname" {
  program = ["bash", "-c", <<-EOF
    railway domain get beholder.seance.dev --json 2>/dev/null | jq -r '{cname: .target}' || echo '{"cname": "pending"}'
  EOF
  ]

  depends_on = [railway_custom_domain.beholder]
}

# Get CNAME for litellm
data "external" "litellm_cname" {
  program = ["bash", "-c", <<-EOF
    railway domain get litellm.seance.dev --json 2>/dev/null | jq -r '{cname: .target}' || echo '{"cname": "pending"}'
  EOF
  ]

  depends_on = [railway_custom_domain.litellm]
}

# ============================================================================
# CLOUDFLARE DNS RECORDS
# ============================================================================

# Backend DNS
resource "cloudflare_record" "backend" {
  zone_id = var.cloudflare_zone_id
  name    = "backend"
  content = data.external.backend_cname.result.cname
  type    = "CNAME"
  ttl     = 1
  proxied = true
}

# Landing page DNS (root domain)
resource "cloudflare_record" "root" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  content = data.external.landing_cname.result.cname
  type    = "CNAME"
  ttl     = 1
  proxied = true
}

# Signaling DNS
resource "cloudflare_record" "signaling" {
  zone_id = var.cloudflare_zone_id
  name    = "signaling"
  content = data.external.signaling_cname.result.cname
  type    = "CNAME"
  ttl     = 1
  proxied = true
}

# Beholder DNS
resource "cloudflare_record" "beholder" {
  zone_id = var.cloudflare_zone_id
  name    = "beholder"
  content = data.external.beholder_cname.result.cname
  type    = "CNAME"
  ttl     = 1
  proxied = true
}

# LiteLLM DNS
resource "cloudflare_record" "litellm" {
  zone_id = var.cloudflare_zone_id
  name    = "litellm"
  content = data.external.litellm_cname.result.cname
  type    = "CNAME"
  ttl     = 1
  proxied = true
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "railway_project_id" {
  description = "Railway project ID"
  value       = railway_project.seance.id
}

output "backend_domain" {
  description = "Backend domain"
  value       = "backend.seance.dev"
}

output "landing_domain" {
  description = "Landing domain"
  value       = "seance.dev"
}

output "signaling_domain" {
  description = "Signaling domain"
  value       = "signaling.seance.dev"
}

output "beholder_domain" {
  description = "Beholder domain"
  value       = "beholder.seance.dev"
}

output "litellm_domain" {
  description = "LiteLLM domain"
  value       = "litellm.seance.dev"
}

output "spaces_endpoint" {
  description = "Spaces API endpoint"
  value       = "https://${digitalocean_spaces_bucket.seance_cdn.region}.digitaloceanspaces.com"
}

output "spaces_cdn_endpoint" {
  description = "Spaces CDN endpoint"
  value       = "https://${digitalocean_spaces_bucket.seance_cdn.name}.${digitalocean_spaces_bucket.seance_cdn.region}.cdn.digitaloceanspaces.com"
}

output "spaces_bucket_name" {
  description = "Spaces bucket name"
  value       = digitalocean_spaces_bucket.seance_cdn.name
}
