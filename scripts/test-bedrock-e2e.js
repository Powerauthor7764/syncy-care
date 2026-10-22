import { probeBedrock } from '../src/core/aws.js';
import { ask, runTool } from '../src/core/service.js';

const probe = await probeBedrock();
console.log('probe', JSON.stringify(probe, null, 2));
if (!probe.ok) process.exitCode = 1;

const first = await ask('maria', "What's happening today?");
console.log('ask', first.classification, first.text.slice(0, 140));

const simplified = await runTool('simplify_text', { patientId: 'maria' });
console.log('simplify reworded=', simplified.reworded);
console.log('simplify text=', simplified.text.slice(0, 220));
if (!simplified.reworded) process.exitCode = 1;
