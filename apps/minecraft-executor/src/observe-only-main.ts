import { randomUUID } from 'node:crypto';
import { loadTradingConfig } from '@wtrader/config';
import { ExternalGameClientAdapter } from '@wtrader/game-client';
import { LocalBridgeServer } from './local-bridge-server.js';
import { SessionRecorder } from './session-recorder.js';

const config = await loadTradingConfig();
if (config.execution.safetyMode !== 'OBSERVE_ONLY') throw new Error('Session capture must start in OBSERVE_ONLY mode');
const sessionId = process.argv[2] ?? `session-${randomUUID()}`;
const recorder = new SessionRecorder(sessionId, `fixtures/sessions/${sessionId}.jsonl`);
const bridge = new LocalBridgeServer(config.bridge);
const client = new ExternalGameClientAdapter(bridge);
client.subscribe((event) => {
  void recorder.record(event);
  if (event.type === 'GUI_OPENED' || event.type === 'GUI_UPDATED') {
    process.stdout.write(`Observed GUI ${event.gui.id} ${event.gui.signature}\n`);
  }
});
await client.connect();
process.stdout.write(`Observe-only bridge listening on ws://${config.bridge.host}:${config.bridge.port} for ${sessionId}\n`);
