import { Chart, ChartProps, ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-30';
import { CONFIG } from './config';

export class SeanceChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    // ClusterIssuers for TLS certificates
    // Created here (not in cert-manager-chart) to ensure CRDs are registered first

    // Self-signed issuer for development
    new ApiObject(this, 'selfsigned-issuer', {
      apiVersion: 'cert-manager.io/v1',
      kind: 'ClusterIssuer',
      metadata: {
        name: 'selfsigned-issuer',
      },
      spec: {
        selfSigned: {},
      },
    });

    // Let's Encrypt production ClusterIssuer
    // Always created, but only used when CONFIG.tls.issuer = 'letsencrypt-prod'
    new ApiObject(this, 'letsencrypt-prod', {
      apiVersion: 'cert-manager.io/v1',
      kind: 'ClusterIssuer',
      metadata: {
        name: 'letsencrypt-prod',
      },
      spec: {
        acme: {
          // Let's Encrypt production server
          server: 'https://acme-v02.api.letsencrypt.org/directory',
          // Email for certificate expiration notifications (update in config.ts)
          email: CONFIG.letsencryptEmail,
          // Secret to store ACME account private key
          privateKeySecretRef: {
            name: 'letsencrypt-prod',
          },
          // HTTP01 challenge solver
          solvers: [
            {
              http01: {
                ingress: {
                  class: 'nginx',
                },
              },
            },
          ],
        },
      },
    });

    // Namespace for all seance resources
    const namespace = new kplus.Namespace(this, 'seance-namespace', {
      metadata: {
        name: CONFIG.namespace,
      },
    });

    // Backend deployment
    const backend = new kplus.Deployment(this, 'backend', {
      metadata: {
        name: 'backend',
        namespace: namespace.name,
      },
      replicas: CONFIG.replicas.backend,
      containers: [
        {
          name: 'backend',
          image: CONFIG.images.backend,
          portNumber: CONFIG.ports.backend,
          envVariables: {
            PORT: kplus.EnvValue.fromValue(CONFIG.ports.backend.toString()),
            DEV_MODE: kplus.EnvValue.fromValue(CONFIG.devMode.toString()),
            CADDY_DOMAIN: kplus.EnvValue.fromValue(CONFIG.backendDomain),
            APP_DOMAIN: kplus.EnvValue.fromValue(CONFIG.appDomain),
            MARKETING_DOMAIN: kplus.EnvValue.fromValue(CONFIG.marketingDomain),
            VITE_BACKEND_URL: kplus.EnvValue.fromValue(`https://${CONFIG.backendDomain}`),
            BACKEND_URL: kplus.EnvValue.fromValue(`https://${CONFIG.backendDomain}`),
            // Secrets (TODO: replace with proper secret management)
            STRIPE_SECRET_KEY: kplus.EnvValue.fromValue(CONFIG.secrets.stripeSecretKey),
            STRIPE_PRICE_ID: kplus.EnvValue.fromValue(CONFIG.secrets.stripePriceId),
            BUILDER_KEY_HASHES: kplus.EnvValue.fromValue(CONFIG.secrets.builderKeyHashes),
            // Redis/Valkey connection (uses service DNS name in k8s)
            REDIS_HOST: kplus.EnvValue.fromValue(CONFIG.redis.serviceName),
            REDIS_PORT: kplus.EnvValue.fromValue(CONFIG.redis.port.toString()),
          },
          securityContext: {
            ensureNonRoot: false,
            readOnlyRootFilesystem: false,
          },
        },
      ],
    });

    // Backend service
    const backendService = backend.exposeViaService({
      name: 'backend-service',
      ports: [{ port: CONFIG.ports.backend, targetPort: CONFIG.ports.backend }],
      serviceType: kplus.ServiceType.CLUSTER_IP,
    });

    // Signaling server deployment (WebRTC)
    const signaling = new kplus.Deployment(this, 'signaling', {
      metadata: {
        name: 'signaling',
        namespace: namespace.name,
      },
      replicas: CONFIG.replicas.signaling,
      containers: [
        {
          name: 'signaling',
          image: CONFIG.images.signaling,
          portNumber: CONFIG.ports.signaling,
          envVariables: {
            PORT: kplus.EnvValue.fromValue(CONFIG.ports.signaling.toString()),
          },
          securityContext: {
            ensureNonRoot: false,
            readOnlyRootFilesystem: false,
          },
        },
      ],
    });

    // Signaling service
    signaling.exposeViaService({
      name: 'signaling-service',
      ports: [{ port: CONFIG.ports.signaling, targetPort: CONFIG.ports.signaling }],
      serviceType: kplus.ServiceType.CLUSTER_IP,
    });

    // Valkey (Redis) deployment for sessions
    const valkey = new kplus.Deployment(this, 'valkey', {
      metadata: {
        name: 'valkey',
        namespace: namespace.name,
      },
      replicas: CONFIG.replicas.valkey,
      containers: [
        {
          name: 'valkey',
          image: CONFIG.images.valkey,
          portNumber: CONFIG.ports.valkey,
          args: CONFIG.devMode
            ? ['--save', '', '--appendonly', 'no']  // No persistence in dev
            : ['--save', '60', '1', '--appendonly', 'yes'],  // Persistence in prod
          securityContext: {
            ensureNonRoot: false,
            readOnlyRootFilesystem: false,
          },
        },
      ],
    });

    // Valkey service
    valkey.exposeViaService({
      name: CONFIG.redis.serviceName,
      ports: [{ port: CONFIG.redis.port, targetPort: CONFIG.redis.port }],
      serviceType: kplus.ServiceType.CLUSTER_IP,
    });

    // Landing page deployment (Vite dev server in dev, built static site in prod)
    const landing = new kplus.Deployment(this, 'landing', {
      metadata: {
        name: 'landing',
        namespace: namespace.name,
      },
      replicas: CONFIG.replicas.landing,
      containers: [
        {
          name: 'landing',
          image: CONFIG.images.landing,
          portNumber: CONFIG.ports.landing,
          envVariables: {
            VITE_DEV_PORT: kplus.EnvValue.fromValue(CONFIG.ports.landing.toString()),
            VITE_BACKEND_URL: kplus.EnvValue.fromValue(`https://${CONFIG.backendDomain}`),
            VITE_AUTH_DOMAIN: kplus.EnvValue.fromValue(`auth.${CONFIG.baseDomain}`),
          },
          securityContext: {
            ensureNonRoot: false,
            readOnlyRootFilesystem: false,
          },
        },
      ],
    });

    // Landing service
    const landingService = landing.exposeViaService({
      name: 'landing-service',
      ports: [{ port: CONFIG.ports.landing, targetPort: CONFIG.ports.landing }],
      serviceType: kplus.ServiceType.CLUSTER_IP,
    });

    // Ingress for routing with TLS
    const ingress = new kplus.Ingress(this, 'seance-ingress', {
      metadata: {
        name: 'seance-ingress',
        namespace: namespace.name,
        annotations: {
          // Nginx ingress annotations
          'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
          'nginx.ingress.kubernetes.io/force-ssl-redirect': 'true',
          // cert-manager will automatically create certificates for this ingress
          'cert-manager.io/cluster-issuer': CONFIG.tls.issuer,
        },
      },
    });

    // Add TLS configuration if enabled
    if (CONFIG.tls.enabled) {
      ingress.addTls([
        {
          hosts: [CONFIG.backendDomain, CONFIG.appDomain, CONFIG.marketingDomain],
          secret: kplus.Secret.fromSecretName(this, 'tls-secret', CONFIG.tls.secretName),
        },
      ]);
    }

    // Backend routes
    ingress.addHostRule(CONFIG.backendDomain, '/',
      kplus.IngressBackend.fromService(backendService, {
        port: CONFIG.ports.backend,
      })
    );

    // App routes (also to backend for now)
    ingress.addHostRule(CONFIG.appDomain, '/',
      kplus.IngressBackend.fromService(backendService, {
        port: CONFIG.ports.backend,
      })
    );

    // Marketing/landing page routes
    ingress.addHostRule(CONFIG.marketingDomain, '/',
      kplus.IngressBackend.fromService(landingService, {
        port: CONFIG.ports.landing,
      })
    );

    // Path-based routing for signaling is handled by the backend
    // Backend proxies /signaling to the signaling service internally
  }
}
