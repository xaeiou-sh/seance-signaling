import { App } from 'cdk8s';
import { SeanceChart } from './seance-chart';
import { CertManagerChart } from './cert-manager-chart';

const app = new App();

// cert-manager (infrastructure dependency)
new CertManagerChart(app, 'cert-manager');

// Seance application
new SeanceChart(app, 'seance');

app.synth();
