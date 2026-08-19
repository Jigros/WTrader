import { createHash } from 'node:crypto';
import type { ClientGuiSnapshot, GuiSlot } from '@wtrader/game-client';

export type SemanticGameAction =
  | 'NEXT_PAGE'
  | 'PREVIOUS_PAGE'
  | 'REFRESH'
  | 'CHANGE_FILTER'
  | 'BUY'
  | 'CONFIRM_BUY'
  | 'CANCEL'
  | 'SELL'
  | 'CONFIRM_SELL'
  | 'BACK';

export interface SemanticSlotExpectation {
  readonly action: SemanticGameAction;
  readonly guiSignature: string;
  readonly slot: number;
  readonly expectedItemType?: string;
  readonly namePattern?: string;
  readonly lorePattern?: string;
  readonly workflowStates: readonly string[];
  readonly confidence: number;
}

export interface SemanticValidation {
  readonly approved: boolean;
  readonly reason?: string;
}

export interface GuiSlotChange {
  readonly slot: number;
  readonly before: GuiSlot | null;
  readonly after: GuiSlot | null;
}

export function guiSlotChanges(previous: ClientGuiSnapshot | null, current: ClientGuiSnapshot): GuiSlotChange[] {
  if (previous === null || previous.signature !== current.signature) {
    return current.slots.map((slot) => ({ slot: slot.slot, before: null, after: slot }));
  }
  const prior = new Map(previous.slots.map((slot) => [slot.slot, slot]));
  return current.slots.flatMap((slot) => {
    const before = prior.get(slot.slot) ?? null;
    return slotFingerprint(before) === slotFingerprint(slot) ? [] : [{ slot: slot.slot, before, after: slot }];
  });
}

export function validateSemanticSlot(
  gui: ClientGuiSnapshot,
  expectation: SemanticSlotExpectation,
  workflowState: string,
): SemanticValidation {
  if (gui.signature !== expectation.guiSignature) return { approved: false, reason: 'GUI_SIGNATURE_MISMATCH' };
  if (!expectation.workflowStates.includes(workflowState)) return { approved: false, reason: 'WORKFLOW_STATE_MISMATCH' };
  const slot = gui.slots.find((candidate) => candidate.slot === expectation.slot);
  if (slot?.item === null || slot?.item === undefined) return { approved: false, reason: 'BUTTON_SLOT_EMPTY' };
  if (expectation.expectedItemType !== undefined && slot.item.itemType !== expectation.expectedItemType) return { approved: false, reason: 'BUTTON_ITEM_TYPE_MISMATCH' };
  const name = slot.rawName ?? slot.item.displayName;
  if (expectation.namePattern !== undefined && !new RegExp(expectation.namePattern, 'i').test(name)) return { approved: false, reason: 'BUTTON_NAME_MISMATCH' };
  const lore = slot.lore ?? slot.item.lore ?? [];
  if (expectation.lorePattern !== undefined && !new RegExp(expectation.lorePattern, 'i').test(lore.join('\n'))) return { approved: false, reason: 'BUTTON_LORE_MISMATCH' };
  return { approved: true };
}

function slotFingerprint(slot: GuiSlot | null): string {
  if (slot === null) return 'empty';
  return createHash('sha256').update(JSON.stringify({
    slot: slot.slot,
    item: slot.item === null ? null : {
      itemType: slot.item.itemType,
      displayName: slot.item.displayName,
      quantity: slot.item.quantity,
      lore: slot.item.lore ?? [],
      metadata: slot.item.customMetadata ?? {},
    },
    rawName: slot.rawName ?? null,
    lore: slot.lore ?? [],
  })).digest('hex');
}
