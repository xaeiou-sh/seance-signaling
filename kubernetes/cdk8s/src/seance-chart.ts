import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-30';

export class SeanceChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    // Namespace for all seance resources
    const namespace = new kplus.Namespace(this, 'seance-namespace', {
      metadata: {
        name: 'seance',
      },
    });

    // Backend deployment
    const backend = new kplus.Deployment(this, 'backend', {
      metadata: {
        namespace: namespace.name,
      },
      replicas: 1,
      containers: [
        {
          name: 'backend',
          image: 'seance-backend:dev', // Will be built with Nix
          portNumber: 8765,
          envVariables: {
            PORT: kplus.EnvValue.fromValue('8765'),
            DEV_MODE: kplus.EnvValue.fromValue('true'),
            CADDY_DOMAIN: kplus.EnvValue.fromValue('backend.dev.localhost'),
            APP_DOMAIN: kplus.EnvValue.fromValue('app.dev.localhost'),
            MARKETING_DOMAIN: kplus.EnvValue.fromValue('dev.localhost'),
            VITE_BACKEND_URL: kplus.EnvValue.fromValue('https://backend.dev.localhost'),
            BACKEND_URL: kplus.EnvValue.fromValue('https://backend.dev.localhost'),
          },
          securityContext: {
            ensureNonRoot: false, // Dev mode, we'll tighten this later
            readOnlyRootFilesystem: false, // Need writable for node_modules
          },
        },
      ],
    });

    // Backend service
    const backendService = backend.exposeViaService({
      name: 'backend-service',
      ports: [{ port: 8765, targetPort: 8765 }],
      serviceType: kplus.ServiceType.CLUSTER_IP,
    });

    // Signaling server deployment (Docker container)
    const signaling = new kplus.Deployment(this, 'signaling', {
      metadata: {
        namespace: namespace.name,
      },
      replicas: 1,
      containers: [
        {
          name: 'signaling',
          image: 'funnyzak/y-webrtc-signaling:latest',
          portNumber: 4444,
          envVariables: {
            PORT: kplus.EnvValue.fromValue('4444'),
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
      ports: [{ port: 4444, targetPort: 4444 }],
      serviceType: kplus.ServiceType.CLUSTER_IP,
    });

    // Valkey (Redis) deployment for sessions
    const valkey = new kplus.Deployment(this, 'valkey', {
      metadata: {
        namespace: namespace.name,
      },
      replicas: 1,
      containers: [
        {
          name: 'valkey',
          image: 'valkey/valkey:latest',
          portNumber: 6379,
          args: ['--save', '', '--appendonly', 'no'], // No persistence in dev
          securityContext: {
            ensureNonRoot: false,
            readOnlyRootFilesystem: false,
          },
        },
      ],
    });

    // Valkey service
    valkey.exposeViaService({
      name: 'valkey-service',
      ports: [{ port: 6379, targetPort: 6379 }],
      serviceType: kplus.ServiceType.CLUSTER_IP,
    });

    // Landing page deployment (Vite dev server)
    const landing = new kplus.Deployment(this, 'landing', {
      metadata: {
        namespace: namespace.name,
      },
      replicas: 1,
      containers: [
        {
          name: 'landing',
          image: 'seance-landing:dev',
          portNumber: 5928,
          envVariables: {
            VITE_DEV_PORT: kplus.EnvValue.fromValue('5928'),
            VITE_BACKEND_URL: kplus.EnvValue.fromValue('https://backend.dev.localhost'),
            VITE_AUTH_DOMAIN: kplus.EnvValue.fromValue('auth.dev.localhost'),
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
      ports: [{ port: 5928, targetPort: 5928 }],
      serviceType: kplus.ServiceType.CLUSTER_IP,
    });

    // Ingress for routing
    // NOTE: This assumes you have an ingress controller installed (we'll use nginx)
    const ingress = new kplus.Ingress(this, 'seance-ingress', {
      metadata: {
        namespace: namespace.name,
        annotations: {
          'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
          'nginx.ingress.kubernetes.io/force-ssl-redirect': 'true',
        },
      },
    });

    // Backend routes
    ingress.addHostRule('backend.dev.localhost', '/',
      kplus.IngressBackend.fromService(backendService, {
        port: 8765,
      })
    );

    // App routes (also to backend for now)
    ingress.addHostRule('app.dev.localhost', '/',
      kplus.IngressBackend.fromService(backendService, {
        port: 8765,
      })
    );

    // Marketing/landing page routes
    ingress.addHostRule('dev.localhost', '/',
      kplus.IngressBackend.fromService(landingService, {
        port: 5928,
      })
    );

    // Path-based routing for signaling is handled by the backend
    // Backend proxies /signaling to the signaling service internally
  }
}
