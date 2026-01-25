// Seance Kubernetes Configuration
// To deploy to a different environment, change ENVIRONMENT and run: npm run synth

export type DeploymentEnvironment = 'dev' | 'prod';

// ============================================================================
// CHANGE THIS TO SWITCH ENVIRONMENTS
// ============================================================================
export const ENVIRONMENT: DeploymentEnvironment = 'prod' as DeploymentEnvironment;
// ============================================================================

// Base domains for each environment
const BASE_DOMAINS = {
  dev: 'dev.localhost',
  prod: 'seance.dev',
} as const;

export const CONFIG = {
  environment: ENVIRONMENT,
  baseDomain: BASE_DOMAINS[ENVIRONMENT],

  // Computed domains - always derived from baseDomain
  get backendDomain() { return `backend.${this.baseDomain}`; },
  get appDomain() { return `app.${this.baseDomain}`; },
  get marketingDomain() { return this.baseDomain; },

  // Container images
  images: {
    backend: ENVIRONMENT === 'dev'
      ? 'seance-backend:dev'
      : `fractalhuman1/seance-backend:${process.env.GIT_COMMIT || 'latest'}`,
    landing: ENVIRONMENT === 'dev'
      ? 'seance-landing:dev'
      : `fractalhuman1/seance-landing:${process.env.GIT_COMMIT || 'latest'}`,
    // External images (same for all environments)
    signaling: 'funnyzak/y-webrtc-signaling:latest',
    valkey: 'valkey/valkey:latest',
  },

  // TLS configuration
  tls: {
    enabled: true,
    issuer: ENVIRONMENT === 'dev' ? 'selfsigned-issuer' : 'letsencrypt-prod',
    // Secret name for TLS certificates (managed by cert-manager)
    secretName: 'seance-tls',
  },

  // Secrets (dummy values for now - same in dev and prod)
  // TODO: Replace with proper secret management before production deployment
  secrets: {
    stripeSecretKey: 'sk_test_dummy_dev_key_replace_in_production',
    stripePriceId: 'price_dummy_dev_id_replace_in_production',
    builderKeyHashes: 'adf1e1bee2a545ca24690755a59ea58af30cf9f86692541a6a932a75dc831334',
  },

  // Let's Encrypt email for certificate expiration notifications
  // TODO: Update this email before running tofu apply for production
  letsencryptEmail: 'admin@seance.dev',

  // Kubernetes namespace
  namespace: ENVIRONMENT === 'dev' ? 'seance' : 'seance-prod',

  // Redis/Valkey connection (uses service DNS name)
  redis: {
    serviceName: 'valkey-service',
    port: 6379,
  },

  // Replica counts
  // All set to 1 for now - main benefit is zero-downtime rolling updates
  replicas: {
    backend: 1,
    landing: 1,
    signaling: 1,
    valkey: 1,
  },

  // Service ports
  ports: {
    backend: 8765,
    landing: 80,
    signaling: 4444,
    valkey: 6379,
  },

  // Environment-specific behavior flags
  devMode: ENVIRONMENT === 'dev',

  // Resource limits (conservative for 2-node s-2vcpu-2gb cluster)
  resources: ENVIRONMENT === 'dev'
    ? {
        // Dev: minimal resources for local kind cluster
        backend: { cpu: '500m', memory: '512Mi' },
        landing: { cpu: '250m', memory: '256Mi' },
      }
    : {
        // Prod: reasonable limits for 2-node cluster (4 vCPU, 4GB total)
        backend: { cpu: '500m', memory: '512Mi' },
        landing: { cpu: '250m', memory: '256Mi' },
      },
} as const;
