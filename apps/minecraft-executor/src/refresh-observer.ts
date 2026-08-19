import type { ClientGuiSnapshot } from '@wtrader/game-client';
import { guiSlotChanges } from './semantic-actions.js';

export interface RefreshTiming {
  readonly actionAt: Date;
  readonly firstSlotChangeAt: Date;
  readonly completeSnapshotAt: Date;
  readonly changedSlots: readonly number[];
  readonly latencyMs: number;
  readonly completeSnapshotLatencyMs: number;
}

export class RefreshObserver {
  private actionAt: Date | null = null;
  private previous: ClientGuiSnapshot | null = null;

  observedManualAction(action: string, observedAt: Date): void {
    if (action === 'REFRESH') this.actionAt = observedAt;
  }

  observe(gui: ClientGuiSnapshot): RefreshTiming | null {
    const changes = guiSlotChanges(this.previous, gui).filter((change) => change.slot >= 0 && change.slot <= 44);
    this.previous = gui;
    if (this.actionAt === null || changes.length === 0 || gui.observedAt < this.actionAt) return null;
    const timing: RefreshTiming = {
      actionAt: this.actionAt,
      firstSlotChangeAt: gui.observedAt,
      completeSnapshotAt: gui.observedAt,
      changedSlots: changes.map((change) => change.slot),
      latencyMs: gui.observedAt.getTime() - this.actionAt.getTime(),
      completeSnapshotLatencyMs: gui.observedAt.getTime() - this.actionAt.getTime(),
    };
    this.actionAt = null;
    return timing;
  }
}
