import { describe, expect, it } from 'vitest';
import { MockGameClientAdapter } from '@wtrader/game-client';
import { validateProfileAction } from '../apps/minecraft-executor/src/gui-profile.js';
import { StaticGuiProfile } from '../apps/minecraft-executor/src/static-gui-profile.js';

const profile = new StaticGuiProfile({
  windows: { auction: { title: 'Auction', windowType: 'minecraft:generic_9x6', slotCount: 90 } },
  listings: { auction: [0, 1, 2] },
  actions: { auction: { REFRESH: { slot: 49, expectedItemType: 'minecraft:anvil' } } },
});

describe('static GUI profile', () => {
  it('uses only supplied window and action definitions', () => {
    const gui = { ...MockGameClientAdapter.gui('Auction', [{ slot: 49, item: { itemType: 'minecraft:anvil', displayName: 'arbitrary', quantity: 1, enchantments: [] } }]), windowType: 'minecraft:generic_9x6', slotCount: 90 };
    expect(profile.listingSlots(gui)).toEqual([0, 1, 2]);
    expect(validateProfileAction(profile, 'REFRESH', gui)).toEqual({ slot: 49, expectedItemType: 'minecraft:anvil' });
  });

  it('has no fallback for an unconfigured window', () => {
    const gui = { ...MockGameClientAdapter.gui('Auction', [{ slot: 49, item: { itemType: 'minecraft:anvil', displayName: 'Refresh', quantity: 1, enchantments: [] } }]), windowType: 'minecraft:generic_9x6', slotCount: 54 };
    expect(profile.listingSlots(gui)).toEqual([]);
    expect(validateProfileAction(profile, 'REFRESH', gui)).toBeNull();
  });
});
