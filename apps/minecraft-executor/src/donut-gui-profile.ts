import type { ClientGuiSnapshot } from '@wtrader/game-client';
import { type GuiAction, type GuiActionSlot, type GuiProfile } from './gui-profile.js';

const auctionTitle = /^Auction \(Page \d+\)$/;

export class DonutGuiProfile implements GuiProfile {
  matchesWindow(window: ClientGuiSnapshot): boolean {
    return isDonutAuctionPage(window) || isDonutPurchaseConfirmation(window);
  }

  listingSlots(window: ClientGuiSnapshot): readonly number[] {
    if (isDonutAuctionPage(window)) return Array.from({ length: 45 }, (_, slot) => slot);
    return isDonutPurchaseConfirmation(window) ? [13] : [];
  }

  getActionSlot(action: GuiAction, window: ClientGuiSnapshot): GuiActionSlot | null {
    if (isDonutAuctionPage(window) && action === 'REFRESH') return { slot: 49, expectedItemType: 'minecraft:anvil' };
    if (!isDonutPurchaseConfirmation(window)) return null;
    if (action === 'CONFIRM_BUY') return { slot: 15, expectedItemType: 'minecraft:lime_stained_glass_pane' };
    if (action === 'CANCEL_BUY') return { slot: 11, expectedItemType: 'minecraft:red_stained_glass_pane' };
    return null;
  }

  validateActionSlot(action: GuiAction, window: ClientGuiSnapshot): boolean {
    return this.getActionSlot(action, window) !== null;
  }
}

export const donutGuiProfile = new DonutGuiProfile();

export function isDonutAuctionPage(window: ClientGuiSnapshot): boolean {
  return window.windowType === 'minecraft:generic_9x6' && window.slotCount === 90 && auctionTitle.test(window.title);
}

export function isDonutPurchaseConfirmation(window: ClientGuiSnapshot): boolean {
  return window.windowType === 'minecraft:generic_9x3' && window.slotCount === 63 && window.title === 'Confirm Purchase';
}
