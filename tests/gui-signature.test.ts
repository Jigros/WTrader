import { describe, expect, it } from 'vitest';
import { structuralGuiSignature } from '@wtrader/game-client';
import { fingerprintGui } from '../apps/minecraft-executor/src/discovery.js';

const item = (name: string) => ({ itemType: 'minecraft:diamond', displayName: name, quantity: 1, enchantments: [] });

describe('GUI structural signatures', () => {
  it('remain stable when auction listing contents change', () => {
    const first = { title: 'Auction House', slotCount: 54, observedAt: new Date(), slots: [item('Diamond'), null] };
    const second = { ...first, slots: [item('Emerald'), null] };
    expect(fingerprintGui(first)).toBe(fingerprintGui(second));
    expect(structuralGuiSignature('Auction House', [{ slot: 0, item: item('Diamond') }, { slot: 1, item: null }]))
      .toBe(structuralGuiSignature('Auction House', [{ slot: 0, item: item('Emerald') }, { slot: 1, item: null }]));
  });
});
