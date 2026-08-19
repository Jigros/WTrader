import { describe, expect, it } from 'vitest';
import { describeGui, DiscoveryAgent, InMemoryKnowledgeStore } from '../apps/minecraft-executor/src/discovery.js';

const snapshot = {
  title: 'Auction House',
  slotCount: 54,
  slots: Array.from({ length: 54 }, (_, index) => index === 0 ? {
    itemType: 'minecraft:diamond', displayName: 'Diamond', quantity: 1, enchantments: [],
  } : null),
  observedAt: new Date('2026-08-19T10:00:00Z'),
};

describe('DiscoveryAgent', () => {
  it('persists GUI knowledge and recognizes repeated structures', async () => {
    const store = new InMemoryKnowledgeStore();
    const agent = new DiscoveryAgent(store);
    const first = await agent.observeGui(snapshot);
    const second = await agent.observeGui({ ...snapshot, observedAt: new Date('2026-08-19T10:01:00Z') });
    expect(first.known).toBe(false);
    expect(second.known).toBe(true);
    expect(describeGui(snapshot).populatedSlots).toEqual([0]);
  });
});
