import { describe, expect, it } from 'vitest';
import { MockGameClientAdapter } from '@wtrader/game-client';
import { guiSlotChanges } from '../apps/minecraft-executor/src/semantic-actions.js';

describe('GUI slot facts', () => {
  it('reports changed slots without assigning an action', () => {
    const before = MockGameClientAdapter.gui('Window', [{ slot: 0, item: { itemType: 'minecraft:stone', displayName: 'Stone', quantity: 1, enchantments: [] } }]);
    const after = { ...before, slots: [{ slot: 0, item: { itemType: 'minecraft:dirt', displayName: 'Dirt', quantity: 1, enchantments: [] } }] };
    expect(guiSlotChanges(before, after)).toHaveLength(1);
  });
});
