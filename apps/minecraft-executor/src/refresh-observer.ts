import type { ClientGuiSnapshot } from '@wtrader/game-client';
import { guiSlotChanges } from './semantic-actions.js';

export interface RefreshTiming {
  readonly actionAt: Date;
  readonly firstSlotChangeAt: Date;
  readonly changedSlots: number;
  readonly latencyMs: number;
}

export class RefreshObserver {
  private actionAt: Date | null = null;
  private previous: ClientGuiSnapshot | null = null;

  observedManualAction(action: string, observedAt: Date): void {
    if (action === 'REFRESH') this.actionAt = observedAt;
  }

  observe(gui: ClientGuiSnapshot): RefreshTiming | null {
    const changes = guiSlotChanges(this.previous, gui);
    this.previous = gui;
    if (this.actionAt === null || changes.length === 0 || gui.observedAt < this.actionAt) return null;
    const timing: RefreshTiming = {
      actionAt: this.actionAt,
      firstSlotChangeAt: gui.observedAt,
      changedSlots: changes.length,
      latencyMs: gui.observedAt.getTime() - this.actionAt.getTime(),
    };
    this.actionAt = null;
    return timing;
  }
}
