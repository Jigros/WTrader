import type { TradingConfig } from '@wtrader/config';
import type { MarketStatistics } from '@wtrader/shared-types';

export interface SellPriceInput {
  readonly acquisitionCost: number;
  readonly currentLowestLegitimatePrice: number | null;
  readonly positionAgeMs: number;
  readonly repricesInLastHour: number;
  readonly lastListedAt: Date | null;
}

export interface SellPriceDecision {
  readonly price: number;
  readonly targetPrice: number;
  readonly canReprice: boolean;
  readonly reasons: readonly string[];
}

export function calculateSellPrice(
  input: SellPriceInput,
  statistics: MarketStatistics,
  config: TradingConfig,
  now = new Date(),
): SellPriceDecision {
  const reasons: string[] = [];
  const costFloor = input.acquisitionCost;
  const roiFloor = input.acquisitionCost * (1 + config.selling.targetRoi);
  const ageHours = input.positionAgeMs / 3_600_000;
  const agingDiscount = Math.min(0.04, Math.max(0, ageHours - 2) * 0.002);
  const fairTarget = statistics.fairValue * (1 - agingDiscount);
  const competitorTarget = input.currentLowestLegitimatePrice === null
    ? fairTarget
    : input.currentLowestLegitimatePrice - config.selling.minimumTick;
  const targetPrice = Math.max(costFloor, roiFloor, Math.min(fairTarget, competitorTarget));
  const price = Math.ceil(targetPrice / config.selling.minimumTick) * config.selling.minimumTick;
  if (price <= input.acquisitionCost) reasons.push('NO_LOSS_FLOOR_APPLIED');
  const elapsed = input.lastListedAt === null ? Number.POSITIVE_INFINITY : now.getTime() - input.lastListedAt.getTime();
  if (elapsed < config.selling.minimumRepricingIntervalMs) reasons.push('REPRICE_INTERVAL_NOT_ELAPSED');
  if (input.repricesInLastHour >= config.selling.maximumRepricesPerHour) reasons.push('REPRICE_HOURLY_LIMIT');
  return { price, targetPrice, canReprice: reasons.length === 0, reasons };
}
