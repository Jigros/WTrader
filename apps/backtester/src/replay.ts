import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SessionReplay } from './replay-engine.js';
import { replaySession } from './replay-engine.js';

const sessionName = process.argv[2];
if (sessionName === undefined) throw new Error('Usage: pnpm replay <session-name>');
const source = await readFile(resolve('fixtures/sessions', `${sessionName}.json`), 'utf8');
const raw = JSON.parse(source) as SessionReplay;
const session: SessionReplay = {
  ...raw,
  observations: raw.observations.map((item) => ({ ...item, observedAt: new Date(item.observedAt) })),
  listings: raw.listings.map((item) => ({ ...item, firstSeenAt: new Date(item.firstSeenAt), lastSeenAt: new Date(item.lastSeenAt) })),
  statistics: raw.statistics.map((item) => ({ ...item, observedAt: new Date(item.observedAt) })),
};
await replaySession(session, (event) => {
  process.stdout.write(`${JSON.stringify({ type: event.type, observedAt: event.observedAt, payload: event.payload })}\n`);
});
