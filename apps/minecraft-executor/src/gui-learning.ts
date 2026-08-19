import type { ClientGuiSnapshot } from '@wtrader/game-client';
import type { SemanticGameAction, SemanticSlotExpectation } from './semantic-actions.js';

export type LearnedGuiState = 'AUCTION_PAGE' | 'UNKNOWN';

export interface GuiLayoutCandidate {
  readonly state: LearnedGuiState;
  readonly title: string;
  readonly titlePattern: string;
  readonly signature: string;
  readonly slotCount: number;
  readonly buttonCandidates: readonly SemanticSlotExpectation[];
  readonly listingSlotCandidates: readonly number[];
  readonly confidence: number;
  readonly observedAt: Date;
}

const actionKeywords: ReadonlyArray<readonly [SemanticGameAction, RegExp]> = [
  ['NEXT_PAGE', /next|forward|page.*right/i],
  ['PREVIOUS_PAGE', /previous|back.*page|page.*left/i],
  ['REFRESH', /refresh|reload/i],
  ['CHANGE_FILTER', /change\s+(?:filter|sort)|filter|sort/i],
  ['CONFIRM_BUY', /confirm.*buy|purchase.*confirm|yes/i],
  ['BUY', /buy|purchase/i],
  ['CANCEL', /cancel|close|no/i],
  ['SELL', /sell|list/i],
  ['CONFIRM_SELL', /confirm.*sell|list.*confirm/i],
  ['BACK', /^back$/i],
];

export function classifyGuiState(title: string): LearnedGuiState {
  return /\b(?:auction|auctions|auction house|ah)\b/i.test(title) ? 'AUCTION_PAGE' : 'UNKNOWN';
}

export function deriveGuiLayoutCandidate(gui: ClientGuiSnapshot): GuiLayoutCandidate {
  const state = classifyGuiState(gui.title);
  const buttonCandidates = gui.slots.flatMap((slot) => {
    if (slot.item === null) return [];
    const name = slot.rawName ?? slot.item.displayName;
    const lore = (slot.lore ?? slot.item.lore ?? []).join('\n');
    const match = actionKeywords.find(([, pattern]) => pattern.test(`${name}\n${lore}`));
    if (match === undefined) return [];
    const [action] = match;
    return [{
      action,
      guiSignature: gui.signature,
      slot: slot.slot,
      expectedItemType: slot.item.itemType,
      namePattern: escapePattern(name),
      ...(lore.length === 0 ? {} : { lorePattern: escapePattern(lore) }),
      workflowStates: workflowStatesFor(action),
      confidence: 0.6,
    }];
  });
  const listingSlotCandidates = gui.slots.flatMap((slot) => {
    if (slot.item === null) return [];
    const text = `${slot.rawName ?? slot.item.displayName}\n${(slot.lore ?? slot.item.lore ?? []).join('\n')}`;
    return actionKeywords.some(([, pattern]) => pattern.test(text)) ? [] : [slot.slot];
  });
  return {
    state,
    title: gui.title,
    titlePattern: state === 'AUCTION_PAGE' ? '\\b(?:auction|auctions|auction house|ah)\\b' : `^${escapePattern(gui.title)}$`,
    signature: gui.signature,
    slotCount: gui.slotCount,
    buttonCandidates,
    listingSlotCandidates,
    confidence: buttonCandidates.length > 0 ? 0.7 : 0.3,
    observedAt: gui.observedAt,
  };
}

function workflowStatesFor(action: SemanticGameAction): readonly string[] {
  switch (action) {
    case 'BUY': return ['VALIDATING'];
    case 'CONFIRM_BUY': return ['FINAL_VALIDATION'];
    case 'SELL': return ['PURCHASED'];
    case 'CONFIRM_SELL': return ['SELL_FINAL_VALIDATION'];
    default: return ['SCANNING', 'VALIDATING', 'FINAL_VALIDATION', 'PURCHASED'];
  }
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
