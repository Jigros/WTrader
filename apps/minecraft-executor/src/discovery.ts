import { createHash } from 'node:crypto';
import type { ActionOutcome, GuiSnapshot } from '@wtrader/shared-types';

export interface DiscoveredGui {
  readonly title: string;
  readonly slotCount: number;
  readonly fingerprint: string;
  readonly populatedSlots: readonly number[];
  readonly confidence: number;
  readonly observedAt: Date;
}

export interface DiscoveryKnowledgeStore {
  saveGui(gui: DiscoveredGui): Promise<void>;
  saveOutcome(outcome: ActionOutcome): Promise<void>;
  findGui(fingerprint: string): Promise<DiscoveredGui | null>;
}

export function fingerprintGui(snapshot: GuiSnapshot): string {
  const structure = snapshot.slots.map((item, slot) => ({
    slot,
    occupied: item !== null,
    control: item?.customMetadata?.['control'] ?? null,
  }));
  return createHash('sha256')
    .update(JSON.stringify({ title: snapshot.title.toLowerCase().trim(), slotCount: snapshot.slotCount, structure }))
    .digest('hex');
}

export function describeGui(snapshot: GuiSnapshot, confidence = 1): DiscoveredGui {
  return {
    title: snapshot.title,
    slotCount: snapshot.slotCount,
    fingerprint: fingerprintGui(snapshot),
    populatedSlots: snapshot.slots.flatMap((item, index) => item === null ? [] : [index]),
    confidence,
    observedAt: snapshot.observedAt,
  };
}

export class InMemoryKnowledgeStore implements DiscoveryKnowledgeStore {
  readonly guis = new Map<string, DiscoveredGui>();
  readonly outcomes: ActionOutcome[] = [];

  saveGui(gui: DiscoveredGui): Promise<void> {
    this.guis.set(gui.fingerprint, gui);
    return Promise.resolve();
  }

  saveOutcome(outcome: ActionOutcome): Promise<void> {
    this.outcomes.push(outcome);
    return Promise.resolve();
  }

  findGui(fingerprint: string): Promise<DiscoveredGui | null> {
    return Promise.resolve(this.guis.get(fingerprint) ?? null);
  }
}

export class DiscoveryAgent {
  constructor(private readonly store: DiscoveryKnowledgeStore) {}

  async observeGui(snapshot: GuiSnapshot): Promise<{ gui: DiscoveredGui; known: boolean }> {
    const gui = describeGui(snapshot);
    const known = await this.store.findGui(gui.fingerprint) !== null;
    await this.store.saveGui(gui);
    return { gui, known };
  }

  async recordOutcome(outcome: ActionOutcome): Promise<void> {
    await this.store.saveOutcome(outcome);
    if (outcome.after !== undefined) await this.observeGui(outcome.after);
  }
}
