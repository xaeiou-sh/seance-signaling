import { App } from 'cdk8s';
import { SeanceChart } from './seance-chart';

const app = new App();
new SeanceChart(app, 'seance');
app.synth();
