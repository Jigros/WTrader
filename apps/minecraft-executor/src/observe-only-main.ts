import { randomUUID } from 'node:crypto';
import { loadTradingConfig } from '@wtrader/config';
import { ExternalGameClientAdapter } from '@wtrader/game-client';
import { LocalBridgeServer } from './local-bridge-server.js';
import { deriveGuiLayoutCandidate } from './gui-learning.js';
import { GuiLayoutStore } from './gui-layout-store.js';
import { RefreshObserver } from './refresh-observer.js';
import { SessionRecorder } from './session-recorder.js';

const config = await loadTradingConfig();
if (config.execution.safetyMode !== 'OBSERVE_ONLY') throw new Error('Session capture must start in OBSERVE_ONLY mode');
const sessionId = process.argv[2] ?? `session-${randomUUID()}`;
const recorder = new SessionRecorder(sessionId, `fixtures/sessions/${sessionId}.jsonl`);
const layouts = new GuiLayoutStore(`fixtures/sessions/${sessionId}.layouts.jsonl`);
const refreshObserver = new RefreshObserver();
const observedLayouts = new Map<string, ReturnType<typeof deriveGuiLayoutCandidate>>();
const bridge = new LocalBridgeServer(config.bridge);
const client = new ExternalGameClientAdapter(bridge);
client.subscribe((event) => {
  void recorder.record(event);
  if (event.type === 'RAW_OBSERVATION') {
    const payload = event.payload;
    if (isManualSlotClick(payload)) {
      const layout = observedLayouts.get(payload.guiSignature);
      const action = layout?.buttonCandidates.find((candidate) => candidate.slot === payload.slot)?.action;
      if (action !== undefined) refreshObserver.observedManualAction(action, event.observedAt);
    }
  }
  if (event.type === 'GUI_OPENED' || event.type === 'GUI_UPDATED') {
    const layout = deriveGuiLayoutCandidate(event.gui);
    observedLayouts.set(layout.signature, layout);
    void layouts.persist(layout);
    const refresh = refreshObserver.observe(event.gui);
    process.stdout.write(`Observed ${layout.state} GUI ${event.gui.id} ${event.gui.signature}${refresh === null ? '' : ` refreshFirstUpdate=${refresh.latencyMs}ms refreshComplete=${refresh.completeSnapshotLatencyMs}ms changedListings=${refresh.changedSlots.length} slots=${refresh.changedSlots.join(',')}`}\n`);
  }
});
await client.connect();
process.stdout.write(`Observe-only bridge listening on ws://${config.bridge.host}:${config.bridge.port} for ${sessionId}\n`);

function isManualSlotClick(payload: unknown): payload is { readonly type: 'manual.slot_click'; readonly guiSignature: string; readonly slot: number } {
  if (typeof payload !== 'object' || payload === null) return false;
  const observation = payload as Record<string, unknown>;
  return observation['type'] === 'manual.slot_click' && typeof observation['guiSignature'] === 'string' && typeof observation['slot'] === 'number';
}
