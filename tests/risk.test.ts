import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseTradingConfig } from '@wtrader/config';
import { evaluateRisk } from '@wtrader/risk';
import type { Opportunity } from '@wtrader/shared-types';

const config = parseTradingConfig(parse(readFileSync('config/default.yaml', 'utf8')));
const opportunity = {
  opportunityId: 'opportunity',
  listing: {
    listingId: 'listing',
    item: { itemType: 'minecraft:diamond', displayName: 'Diamond', quantity: 1, enchantments: [] },
    normalizedItemId: 'diamond',
    priceTotal: 1_000_000,
    pricePerUnit: 1_000_000,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    auctionPage: 1,
    auctionSlot: 0,
    rawMetadata: {},
  },
  statistics: {
    marketId: 'diamond', observedAt: new Date(), sampleSize: 20, weightedMedian: 1_200_000,
    rollingMedian: 1_200_000, ema: 1_200_000, p10: 1_100_000, p25: 1_150_000,
    p75: 1_250_000, minimumPrice: 1_000_000, listingCount: 20, visibleSupply: 100,
    volatility: 0.1, liquidityScore: 0.9, estimatedSaleTimeMs: 3_600_000,
    fairValue: 1_200_000, confidence: 'HIGH', stale: false,
  },
  expectedSellPrice: 1_200_000,
  expectedProfit: 200_000,
  roi: 0.2,
  expectedHoldingTimeMs: 3_600_000,
  profitPerCapitalHour: 0.2,
  score: 0.16,
  confidence: 'HIGH',
  detectedAt: new Date(),
} satisfies Opportunity;

describe('evaluateRisk', () => {
  it('approves an opportunity within all limits', () => {
    const decision = evaluateRisk(opportunity, {
      accountId: 'account', availableCapital: 20_000_000, dailyRealizedPnl: 0,
      consecutiveExecutionFailures: 0, positions: [], tradingPaused: false,
    }, config);
    expect(decision.approved).toBe(true);
    expect(decision.maxAllowedPrice).toBe(4_000_000);
  });

  it('enforces per-market exposure and circuit breakers', () => {
    const decision = evaluateRisk(opportunity, {
      accountId: 'account', availableCapital: 20_000_000, dailyRealizedPnl: 0,
      consecutiveExecutionFailures: 3,
      positions: [{ marketId: 'diamond', acquisitionCost: 3_500_000, quantity: 2 }],
      tradingPaused: false,
    }, config);
    expect(decision.approved).toBe(false);
    expect(decision.reasons).toContain('MAX_ITEM_EXPOSURE_EXCEEDED');
    expect(decision.reasons).toContain('EXECUTION_FAILURE_CIRCUIT_BREAKER');
  });
});
