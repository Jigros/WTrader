import { describe, expect, it } from 'vitest';
import { normalizeItem } from '@wtrader/market-model';

const base = {
  itemType: 'minecraft:diamond_sword',
  displayName: '§bMarket Sword',
  quantity: 1,
  enchantments: [
    { id: 'minecraft:unbreaking', level: 3 },
    { id: 'minecraft:sharpness', level: 5 },
  ],
  relevantNbt: { custom: { value: 1 }, ignoredOrder: ['a', 'b'] },
};

describe('normalizeItem', () => {
  it('produces a stable identity independent of property and enchantment order', () => {
    const left = normalizeItem(base);
    const right = normalizeItem({
      ...base,
      enchantments: [...base.enchantments].reverse(),
      relevantNbt: { ignoredOrder: ['a', 'b'], custom: { value: 1 } },
    });
    expect(left.marketId).toBe(right.marketId);
    expect(left.displayName).toBe('Market Sword');
  });

  it('separates materially different enchantments', () => {
    const left = normalizeItem(base);
    const right = normalizeItem({ ...base, enchantments: [{ id: 'minecraft:sharpness', level: 4 }] });
    expect(left.marketId).not.toBe(right.marketId);
  });
});
