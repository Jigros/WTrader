import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseTradingConfig } from '@wtrader/config';
import { calculateSellPrice } from '@wtrader/selling';

const config = parseTradingConfig(parse(readFileSync('config/default.yaml', 'utf8')));
const stats = { marketId: 'diamond', observedAt: new Date(), sampleSize: 20, weightedMedian: 900, rollingMedian: 900, ema: 900, p10: 800, p25: 850, p75: 950, minimumPrice: 800, listingCount: 20, visibleSupply: 100, volatility: 0.1, liquidityScore: 0.9, estimatedSaleTimeMs: 3_600_000, fairValue: 900, confidence: 'HIGH' as const, stale: false };

describe('calculateSellPrice', () => {
  it('never intentionally prices below acquisition cost', () => {
    const result = calculateSellPrice({ acquisitionCost: 1_000, currentLowestLegitimatePrice: 800, positionAgeMs: 90_000_000, repricesInLastHour: 0, lastListedAt: null }, stats, config);
    expect(result.price).toBeGreaterThanOrEqual(1_000);
  });

  it('enforces repricing limits', () => {
    const result = calculateSellPrice({ acquisitionCost: 500, currentLowestLegitimatePrice: 1000, positionAgeMs: 1, repricesInLastHour: 2, lastListedAt: new Date() }, stats, config);
    expect(result.canReprice).toBe(false);
    expect(result.reasons).toContain('REPRICE_HOURLY_LIMIT');
  });
});
