import { describe, expect, it } from 'vitest';
import { MockGameClientAdapter } from '@wtrader/game-client';
import { donutGuiProfile, isDonutAuctionPage } from '../apps/minecraft-executor/src/donut-gui-profile.js';
import { validateProfileAction } from '../apps/minecraft-executor/src/gui-profile.js';

function window(title: string, windowType: string, slotCount: number, slots: Parameters<typeof MockGameClientAdapter.gui>[1]) {
  return { ...MockGameClientAdapter.gui(title, slots), windowType, slotCount };
}

describe('observed Donut GUI profile', () => {
  it('maps only observed auction facts', () => {
    const gui = window('Auction (Page 7)', 'minecraft:generic_9x6', 90, [{ slot: 49, item: { itemType: 'minecraft:anvil', displayName: 'Refresh', quantity: 1, enchantments: [] } }]);
    expect(isDonutAuctionPage(gui)).toBe(true);
    expect(donutGuiProfile.listingSlots(gui)).toEqual(Array.from({ length: 45 }, (_, slot) => slot));
    expect(validateProfileAction(donutGuiProfile, 'REFRESH', gui)).toEqual({ slot: 49, expectedItemType: 'minecraft:anvil' });
  });

  it('maps observed purchase confirmation controls only', () => {
    const gui = window('Confirm Purchase', 'minecraft:generic_9x3', 63, [
      { slot: 11, item: { itemType: 'minecraft:red_stained_glass_pane', displayName: 'Cancel', quantity: 1, enchantments: [] } },
      { slot: 15, item: { itemType: 'minecraft:lime_stained_glass_pane', displayName: 'Confirm', quantity: 1, enchantments: [] } },
    ]);
    expect(validateProfileAction(donutGuiProfile, 'CONFIRM_BUY', gui)).toEqual({ slot: 15, expectedItemType: 'minecraft:lime_stained_glass_pane' });
    expect(validateProfileAction(donutGuiProfile, 'CANCEL_BUY', gui)).toEqual({ slot: 11, expectedItemType: 'minecraft:red_stained_glass_pane' });
  });

  it('rejects unobserved buy actions', () => {
    const gui = window('Auction (Page 1)', 'minecraft:generic_9x6', 90, []);
    expect(validateProfileAction(donutGuiProfile, 'BUY', gui)).toBeNull();
  });
});
