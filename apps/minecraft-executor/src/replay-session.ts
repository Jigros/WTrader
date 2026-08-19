import { resolve } from 'node:path';
import { SessionRecorder } from './session-recorder.js';

const sessionId = process.argv[2];
if (sessionId === undefined) throw new Error('Usage: pnpm replay:session <session-id>');
const events = await SessionRecorder.read(resolve('fixtures/sessions', `${sessionId}.jsonl`));
for (const entry of events) process.stdout.write(`${JSON.stringify(entry)}\n`);
