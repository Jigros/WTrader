import { describe, expect, it } from 'vitest';
import { createReplayTimeline } from '../apps/backtester/src/replay-engine.js';

describe('createReplayTimeline', () => {
  it('orders observations, listings, and statistics deterministically', () => {
    const timeline = createReplayTimeline({
      sessionId: 'session',
      observations: [{ sessionId: 'session', sequence: 1, kind: 'CHAT', observedAt: new Date('2026-08-19T10:00:03Z'), payload: 'ok' }],
      listings: [{
        listingId: 'listing', item: { itemType: 'minecraft:diamond', displayName: 'Diamond', quantity: 1, enchantments: [] },
        normalizedItemId: 'diamond', priceTotal: 100, pricePerUnit: 100,
        firstSeenAt: new Date('2026-08-19T10:00:01Z'), lastSeenAt: new Date('2026-08-19T10:00:01Z'),
        auctionPage: 1, auctionSlot: 0, rawMetadata: {},
      }],
      statistics: [{
        marketId: 'diamond', observedAt: new Date('2026-08-19T10:00:02Z'), sampleSize: 5,
        weightedMedian: 120, rollingMedian: 120, ema: 120, p10: 110, p25: 115, p75: 125,
        minimumPrice: 100, listingCount: 5, visibleSupply: 5, volatility: 0.1, liquidityScore: 0.5,
        estimatedSaleTimeMs: 1000, fairValue: 120, confidence: 'MEDIUM', stale: false,
      }],
    });
    expect(timeline.map((event) => event.type)).toEqual(['LISTING', 'STATISTICS', 'OBSERVATION']);
  });
});
