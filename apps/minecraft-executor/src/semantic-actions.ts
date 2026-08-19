import { createHash } from 'node:crypto';
import type { ClientGuiSnapshot, GuiSlot } from '@wtrader/game-client';

export interface GuiSlotChange {
  readonly slot: number;
  readonly before: GuiSlot | null;
  readonly after: GuiSlot | null;
}

export function guiSlotChanges(previous: ClientGuiSnapshot | null, current: ClientGuiSnapshot): GuiSlotChange[] {
  if (previous === null || previous.signature !== current.signature) return current.slots.map((slot) => ({ slot: slot.slot, before: null, after: slot }));
  const prior = new Map(previous.slots.map((slot) => [slot.slot, slot]));
  return current.slots.flatMap((slot) => {
    const before = prior.get(slot.slot) ?? null;
    return slotFingerprint(before) === slotFingerprint(slot) ? [] : [{ slot: slot.slot, before, after: slot }];
  });
}

function slotFingerprint(slot: GuiSlot | null): string {
  return createHash('sha256').update(JSON.stringify(slot)).digest('hex');
}
