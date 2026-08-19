import { randomUUID } from 'node:crypto';
import type { TradingConfig } from '@wtrader/config';
import type { AuctionListing, MarketStatistics, Opportunity } from '@wtrader/shared-types';

export function dynamicMinimumRoi(statistics: MarketStatistics, config: TradingConfig): number {
  const model = config.trading.dynamicRoi;
  const holdingHours = statistics.estimatedSaleTimeMs / 3_600_000;
  const illiquidity = 1 - statistics.liquidityScore;
  const confidencePenalty = statistics.confidence === 'HIGH' ? 0 : statistics.confidence === 'MEDIUM' ? model.lowConfidencePenalty / 2 : model.lowConfidencePenalty;
  const turnoverBonus = statistics.liquidityScore * model.highTurnoverBonus;
  const required = model.base
    + statistics.volatility * model.volatilityWeight
    + illiquidity * model.illiquidityWeight
    + holdingHours * model.holdingHourWeight
    + confidencePenalty
    - turnoverBonus;
  return Math.min(model.maximum, Math.max(model.minimum, required));
}

export function evaluateOpportunity(
  listing: AuctionListing,
  statistics: MarketStatistics,
  config: TradingConfig,
  detectedAt = new Date(),
): Opportunity | null {
  if (statistics.stale || statistics.fairValue <= 0) return null;
  const expectedSellPrice = statistics.fairValue;
  const expectedProfit = expectedSellPrice * listing.item.quantity - listing.priceTotal;
  const roi = expectedProfit / listing.priceTotal;
  const holdingHours = Math.max(statistics.estimatedSaleTimeMs / 3_600_000, 1 / 60);
  const profitPerCapitalHour = expectedProfit / listing.priceTotal / holdingHours;
  const minimumRoi = dynamicMinimumRoi(statistics, config);
  if (expectedProfit < config.trading.minimumAbsoluteProfit || roi < minimumRoi) return null;
  const score = profitPerCapitalHour * statistics.liquidityScore * (1 - Math.min(statistics.volatility, 0.95));
  return {
    opportunityId: randomUUID(),
    listing,
    statistics,
    expectedSellPrice,
    expectedProfit,
    roi,
    expectedHoldingTimeMs: statistics.estimatedSaleTimeMs,
    profitPerCapitalHour,
    score,
    confidence: statistics.confidence,
    detectedAt,
  };
}
