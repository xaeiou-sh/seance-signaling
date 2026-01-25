// Seance Kubernetes Configuration
// To deploy to a different environment, change ENVIRONMENT and run: npm run synth

import { loadSecrets, flattenSecrets } from './secrets';

export type DeploymentEnvironment = 'dev' | 'local' | 'prod';

// ============================================================================
// ENVIRONMENT - Automatically set by scripts
// ============================================================================
// k8s-dev sets SEANCE_ENV=dev
// k8s-local sets SEANCE_ENV=local (production build, local cluster)
// k8s-deploy sets SEANCE_ENV=prod
export const ENVIRONMENT: DeploymentEnvironment =
  (process.env.SEANCE_ENV as DeploymentEnvironment) || 'dev';
// ============================================================================

// Helper: Returns true for production-like environments (local, prod)
// Use this to ensure 'local' mirrors 'prod' configuration exactly
const isProdLike = () => ENVIRONMENT === 'local' || ENVIRONMENT === 'prod';

// Helper: Returns prod value for local/prod, dev value for dev
// Ensures 'local' uses same config as 'prod' to catch issues before deployment
const prodOrDev = <T>(prodValue: T, devValue: T): T =>
  isProdLike() ? prodValue : devValue;

// Base domains for each environment
const BASE_DOMAINS = {
  dev: 'dev.localhost',
  local: 'local.localhost',
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
    // Dev uses local images with Vite dev server, local/prod use production builds
    backend: prodOrDev(
      `fractalhuman1/seance-backend:${process.env.GIT_COMMIT || 'latest'}`,
      'seance-backend:dev'
    ),
    landing: prodOrDev(
      `fractalhuman1/seance-landing:${process.env.GIT_COMMIT || 'latest'}`,
      'seance-landing:dev'
    ),
    // External images (same for all environments)
    signaling: 'funnyzak/y-webrtc-signaling:latest',
    valkey: 'valkey/valkey:latest',
    litellm: 'ghcr.io/berriai/litellm:main-latest',
  },

  // TLS configuration
  tls: {
    enabled: true,
    // Only prod uses Let's Encrypt (requires public domains)
    // Dev and local use self-signed certs (.localhost domains)
    issuer: ENVIRONMENT === 'prod' ? 'letsencrypt-prod' : 'selfsigned-issuer',
    // Secret name for TLS certificates (managed by cert-manager)
    secretName: 'seance-tls',
  },

  // Let's Encrypt email for certificate expiration notifications
  // TODO: Update this email before running tofu apply for production
  letsencryptEmail: 'admin@seance.dev',

  // Kubernetes namespace (only differs in prod for cluster isolation)
  namespace: ENVIRONMENT === 'prod' ? 'seance-prod' : 'seance',

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
    litellm: 1,
  },

  // Service ports
  ports: {
    backend: 8765,
    landing: 80,
    signaling: 4444,
    valkey: 6379,
    litellm: 4000,
  },

  // Environment-specific behavior flags
  // Only dev uses dev mode (Vite dev server). Local uses production builds like prod.
  devMode: ENVIRONMENT === 'dev',

  // Resource limits
  // IMPORTANT: local mirrors prod exactly to catch resource issues before deployment
  resources: prodOrDev(
    {
      // Prod/Local: Conservative limits for 2-node s-2vcpu-2gb cluster (4 vCPU, 4GB total)
      // Landing uses nginx serving static files - very lightweight
      backend: { cpuMillis: 500, memoryMebibytes: 512 },
      landing: { cpuMillis: 250, memoryMebibytes: 256 },
    },
    {
      // Dev: No resource limits (local machines have 16-64GB RAM)
      // Vite dev server needs ~1GB memory, so we don't constrain it
      backend: undefined,
      landing: undefined,
    }
  ),

  // Secrets - loaded from SOPS-encrypted file at synth time
  // Decrypted and parsed as TypeScript object for type-safe access
  get secrets() {
    return flattenSecrets(loadSecrets());
  },
} as const;
