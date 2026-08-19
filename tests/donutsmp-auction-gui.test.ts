import { describe, expect, it } from 'vitest';
import { deriveGuiLayoutCandidate } from '../apps/minecraft-executor/src/gui-learning.js';
import { MockGameClientAdapter } from '@wtrader/game-client';

describe('seeded DonutSMP auction GUI', () => {
  it('recognizes exact auction page titles and derives page number', () => {
    const gui = MockGameClientAdapter.gui('Auction (Page 2)', []);
    const layout = deriveGuiLayoutCandidate(gui);
    expect(layout.state).toBe('AUCTION_PAGE');
    expect(layout.pageNumber).toBe(2);
    expect(layout.titlePattern).toBe('^Auction \\(Page (\\d+)\\)$');
  });

  it('maps an anvil to refresh without hardcoding a slot', () => {
    const gui = MockGameClientAdapter.gui('Auction (Page 1)', [{ slot: 41, item: { itemType: 'ANVIL', displayName: 'Refresh', quantity: 1, enchantments: [] } }]);
    const layout = deriveGuiLayoutCandidate(gui);
    expect(layout.buttonCandidates).toMatchObject([{ action: 'REFRESH', slot: 41, expectedItemType: 'ANVIL' }]);
  });

  it('maps the confirmed filter tooltip semantically', () => {
    const gui = MockGameClientAdapter.gui('Auction (Page 1)', [{ slot: 5, item: { itemType: 'HOPPER', displayName: 'Filter', quantity: 1, enchantments: [], lore: ['Click to Change'] } }]);
    const layout = deriveGuiLayoutCandidate(gui);
    expect(layout.buttonCandidates).toMatchObject([{ action: 'CHANGE_FILTER', slot: 5 }]);
  });
});
