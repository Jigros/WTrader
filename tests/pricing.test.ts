import { describe, expect, it } from 'vitest';
import { calculateMarketStatistics } from '@wtrader/pricing';

describe('calculateMarketStatistics', () => {
  it('filters extreme outliers and returns a robust fair value', () => {
    const now = new Date('2026-08-19T10:00:00Z');
    const prices = [100, 101, 102, 103, 104, 105, 106, 107, 10_000];
    const result = calculateMarketStatistics('diamond', prices.map((price) => ({
      pricePerUnit: price,
      quantity: 1,
      observedAt: now,
    })), {
      emaAlpha: 0.25,
      outlierIqrMultiplier: 1.5,
      minimumSamples: 5,
      staleAfterMs: 30_000,
      now,
    });
    expect(result.sampleSize).toBe(8);
    expect(result.fairValue).toBeLessThan(110);
    expect(result.stale).toBe(false);
  });

  it('marks old observations stale', () => {
    const result = calculateMarketStatistics('diamond', [{
      pricePerUnit: 100,
      quantity: 1,
      observedAt: new Date('2026-08-19T09:00:00Z'),
    }], {
      emaAlpha: 0.25,
      outlierIqrMultiplier: 1.5,
      minimumSamples: 5,
      staleAfterMs: 30_000,
      now: new Date('2026-08-19T10:00:00Z'),
    });
    expect(result.stale).toBe(true);
    expect(result.confidence).toBe('INSUFFICIENT_DATA');
  });
});
