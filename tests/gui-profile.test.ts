import { describe, expect, it } from 'vitest';
import { MockGameClientAdapter } from '@wtrader/game-client';
import { type GuiProfile, validateProfileAction } from '../apps/minecraft-executor/src/gui-profile.js';

const profile: GuiProfile = {
  matchesWindow: (window) => window.title === 'Configured Donut Window' && window.windowType === 'minecraft:generic_9x6',
  listingSlots: () => [0, 1, 2],
  getActionSlot: (action) => action === 'REFRESH' ? { slot: 49, expectedItemType: 'minecraft:anvil' } : null,
  validateActionSlot: (_action, window) => window.slots.some((slot) => slot.slot === 49 && slot.item?.itemType === 'minecraft:anvil'),
};

describe('explicit GUI profiles', () => {
  it('does not infer controls from names or lore', () => {
    const gui = { ...MockGameClientAdapter.gui('Configured Donut Window', [{ slot: 49, item: { itemType: 'minecraft:anvil', displayName: 'Anything', quantity: 1, enchantments: [], lore: ['not interpreted'] } }]), windowType: 'minecraft:generic_9x6' };
    expect(validateProfileAction(profile, 'REFRESH', gui)).toEqual({ slot: 49, expectedItemType: 'minecraft:anvil' });
  });

  it('rejects profile actions for an unmatched window or changed item', () => {
    const gui = { ...MockGameClientAdapter.gui('Other', [{ slot: 49, item: { itemType: 'minecraft:anvil', displayName: 'Refresh', quantity: 1, enchantments: [] } }]), windowType: 'minecraft:generic_9x6' };
    expect(validateProfileAction(profile, 'REFRESH', gui)).toBeNull();
  });
});
