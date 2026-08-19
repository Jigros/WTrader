import type { ClientGuiSnapshot } from '@wtrader/game-client';

export type GuiAction = 'REFRESH' | 'NEXT_PAGE' | 'PREVIOUS_PAGE' | 'FILTER' | 'BUY' | 'CONFIRM_BUY' | 'CANCEL_BUY';

export interface GuiActionSlot {
  readonly slot: number;
  readonly expectedItemType?: string;
  readonly expectedItemFingerprint?: string;
}

export interface GuiProfile {
  matchesWindow(window: ClientGuiSnapshot): boolean;
  listingSlots(window: ClientGuiSnapshot): readonly number[];
  getActionSlot(action: GuiAction, window: ClientGuiSnapshot): GuiActionSlot | null;
  validateActionSlot(action: GuiAction, window: ClientGuiSnapshot): boolean;
}

export function validateProfileAction(profile: GuiProfile, action: GuiAction, window: ClientGuiSnapshot): GuiActionSlot | null {
  const expectation = profile.getActionSlot(action, window);
  if (expectation === null || !profile.matchesWindow(window)) return null;
  const slot = window.slots.find((candidate) => candidate.slot === expectation.slot);
  if (slot?.item === undefined || slot.item === null) return null;
  if (expectation.expectedItemType !== undefined && slot.item.itemType !== expectation.expectedItemType) return null;
  return profile.validateActionSlot(action, window) ? expectation : null;
}
