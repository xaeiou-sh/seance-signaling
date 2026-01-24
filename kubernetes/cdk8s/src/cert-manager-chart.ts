import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-30';
import { Certmanager } from '../imports/cert-manager';

export class CertManagerChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    // Create cert-manager namespace first
    new kplus.Namespace(this, 'cert-manager-namespace', {
      metadata: {
        name: 'cert-manager',
      },
    });

    // Install cert-manager via Helm
    new Certmanager(this, 'cert-manager', {
      namespace: 'cert-manager',
      releaseName: 'cert-manager',
      values: {
        // Install CRDs as part of the Helm chart
        installCrDs: true,
        // Global configuration
        global: {
          leaderElection: {
            namespace: 'cert-manager',
          },
        },
      },
    });

    // ClusterIssuers are created in seance-chart.ts to ensure
    // cert-manager CRDs are fully registered before creating issuer resources
  }
}
