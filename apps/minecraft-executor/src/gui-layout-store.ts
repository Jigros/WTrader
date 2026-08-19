import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { GuiLayoutCandidate } from './gui-learning.js';

export interface PersistedGuiLayout {
  readonly state: GuiLayoutCandidate['state'];
  readonly title: string;
  readonly titlePattern: string;
  readonly signature: string;
  readonly slotCount: number;
  readonly buttonCandidates: GuiLayoutCandidate['buttonCandidates'];
  readonly listingSlotCandidates: GuiLayoutCandidate['listingSlotCandidates'];
  readonly confidence: number;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
}

export class GuiLayoutStore {
  constructor(private readonly destination: string) {}

  async persist(layout: GuiLayoutCandidate): Promise<PersistedGuiLayout> {
    const record: PersistedGuiLayout = {
      ...layout,
      firstSeenAt: layout.observedAt,
      lastSeenAt: layout.observedAt,
    };
    await mkdir(dirname(resolve(this.destination)), { recursive: true });
    await appendFile(this.destination, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }
}
