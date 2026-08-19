import type { ClientGuiSnapshot } from '@wtrader/game-client';
import type { SemanticGameAction, SemanticSlotExpectation } from './semantic-actions.js';

export type LearnedGuiState = 'AUCTION_PAGE' | 'PURCHASE_CONFIRMATION' | 'UNKNOWN';

export const auctionPageTitlePattern = /^Auction \(Page (\d+)\)$/;

export interface GuiLayoutCandidate {
  readonly state: LearnedGuiState;
  readonly pageNumber?: number;
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

export function classifyGuiState(title: string, windowType?: string): LearnedGuiState {
  if (auctionPageTitlePattern.test(title)) return 'AUCTION_PAGE';
  if (title === 'Confirm Purchase' && windowType === 'minecraft:generic_9x3') return 'PURCHASE_CONFIRMATION';
  return 'UNKNOWN';
}

export function auctionPageNumber(title: string): number | null {
  const page = auctionPageTitlePattern.exec(title)?.[1];
  return page === undefined ? null : Number(page);
}

export function deriveGuiLayoutCandidate(gui: ClientGuiSnapshot): GuiLayoutCandidate {
  const state = classifyGuiState(gui.title, gui.windowType);
  const pageNumber = auctionPageNumber(gui.title);
  const buttonCandidates = gui.slots.flatMap((slot) => {
    if (slot.item === null) return [];
    const name = slot.rawName ?? slot.item.displayName;
    const lore = (slot.lore ?? slot.item.lore ?? []).join('\n');
    const text = `${name}\n${lore}`;
    const match = state === 'AUCTION_PAGE'
      ? slot.slot === 49 && isAnvil(slot.item.itemType) ? (['REFRESH', /(?:)/] as const) : actionKeywords.filter(([action]) => action !== 'REFRESH').find(([, pattern]) => pattern.test(text))
      : state === 'PURCHASE_CONFIRMATION'
        ? purchaseConfirmationAction(slot.slot, slot.item.itemType)
        : actionKeywords.find(([, pattern]) => pattern.test(text));
    if (match === undefined) return [];
    const [action] = match;
    return [{
      action,
      guiSignature: gui.signature,
      slot: slot.slot,
      expectedItemType: slot.item.itemType,
      ...(state === 'AUCTION_PAGE' && action === 'REFRESH' ? {} : { namePattern: escapePattern(name) }),
      ...(lore.length === 0 ? {} : { lorePattern: escapePattern(lore) }),
      workflowStates: workflowStatesFor(action),
      confidence: 0.6,
    }];
  });
  const listingSlotCandidates = state === 'AUCTION_PAGE'
    ? Array.from({ length: 45 }, (_, slot) => slot)
    : state === 'PURCHASE_CONFIRMATION' ? [13]
    : gui.slots.flatMap((slot) => {
      if (slot.item === null) return [];
      const text = `${slot.rawName ?? slot.item.displayName}\n${(slot.lore ?? slot.item.lore ?? []).join('\n')}`;
      return actionKeywords.some(([, pattern]) => pattern.test(text)) ? [] : [slot.slot];
    });
  return {
    state,
    ...(pageNumber === null ? {} : { pageNumber }),
    title: gui.title,
    titlePattern: state === 'AUCTION_PAGE' ? auctionPageTitlePattern.source : `^${escapePattern(gui.title)}$`,
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

function purchaseConfirmationAction(slot: number, itemType: string): readonly [SemanticGameAction, RegExp] | undefined {
  const type = itemType.toLowerCase();
  if (slot === 11 && type === 'minecraft:red_stained_glass_pane') return ['CANCEL', /(?:)/];
  if (slot === 15 && type === 'minecraft:lime_stained_glass_pane') return ['CONFIRM_BUY', /(?:)/];
  return undefined;
}

function isAnvil(itemType: string): boolean {
  return itemType.toLowerCase() === 'minecraft:anvil' || itemType.toLowerCase() === 'anvil';
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
