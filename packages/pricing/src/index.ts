import type { ConfidenceLevel, MarketStatistics } from '@wtrader/shared-types';

export interface PriceObservation {
  readonly pricePerUnit: number;
  readonly quantity: number;
  readonly observedAt: Date;
}

export interface PricingOptions {
  readonly emaAlpha: number;
  readonly outlierIqrMultiplier: number;
  readonly minimumSamples: number;
  readonly staleAfterMs: number;
  readonly now?: Date;
  readonly previousEma?: number;
  readonly estimatedSaleTimeMs?: number;
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function weightedMedian(observations: readonly PriceObservation[]): number {
  const sorted = [...observations].sort((left, right) => left.pricePerUnit - right.pricePerUnit);
  const totalWeight = sorted.reduce((sum, item) => sum + Math.max(item.quantity, 1), 0);
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += Math.max(item.quantity, 1);
    if (cumulative >= totalWeight / 2) return item.pricePerUnit;
  }
  return sorted.at(-1)?.pricePerUnit ?? 0;
}

function classifyConfidence(sampleSize: number, liquidity: number, volatility: number): ConfidenceLevel {
  if (sampleSize < 3) return 'INSUFFICIENT_DATA';
  if (sampleSize >= 15 && liquidity >= 0.65 && volatility <= 0.2) return 'HIGH';
  if (sampleSize >= 5 && liquidity >= 0.3 && volatility <= 0.5) return 'MEDIUM';
  return 'LOW';
}

export function calculateMarketStatistics(
  marketId: string,
  observations: readonly PriceObservation[],
  options: PricingOptions,
): MarketStatistics {
  const now = options.now ?? new Date();
  const valid = observations.filter((item) => Number.isFinite(item.pricePerUnit) && item.pricePerUnit > 0 && item.quantity > 0);
  const initialPrices = valid.map((item) => item.pricePerUnit).sort((left, right) => left - right);
  const initialQ1 = percentile(initialPrices, 0.25);
  const initialQ3 = percentile(initialPrices, 0.75);
  const iqr = initialQ3 - initialQ1;
  const lower = Math.max(0, initialQ1 - options.outlierIqrMultiplier * iqr);
  const upper = initialQ3 + options.outlierIqrMultiplier * iqr;
  const filtered = valid.filter((item) => item.pricePerUnit >= lower && item.pricePerUnit <= upper);
  const prices = filtered.map((item) => item.pricePerUnit).sort((left, right) => left - right);
  const median = percentile(prices, 0.5);
  const weighted = weightedMedian(filtered);
  const previousEma = options.previousEma ?? median;
  const ema = options.emaAlpha * median + (1 - options.emaAlpha) * previousEma;
  const mean = prices.reduce((sum, price) => sum + price, 0) / Math.max(prices.length, 1);
  const variance = prices.reduce((sum, price) => sum + (price - mean) ** 2, 0) / Math.max(prices.length, 1);
  const volatility = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const visibleSupply = filtered.reduce((sum, item) => sum + item.quantity, 0);
  const liquidityScore = Math.min(1, Math.log1p(visibleSupply) / 8) * Math.min(1, filtered.length / 15);
  const latest = valid.reduce((latestDate, item) => item.observedAt > latestDate ? item.observedAt : latestDate, new Date(0));
  const stale = now.getTime() - latest.getTime() > options.staleAfterMs;
  const sampleConfidence = classifyConfidence(filtered.length, liquidityScore, volatility);
  const confidence = filtered.length < options.minimumSamples ? 'INSUFFICIENT_DATA' : sampleConfidence;
  const fairValue = weighted * 0.5 + ema * 0.3 + percentile(prices, 0.25) * 0.2;
  return {
    marketId,
    observedAt: now,
    sampleSize: filtered.length,
    weightedMedian: weighted,
    rollingMedian: median,
    ema,
    p10: percentile(prices, 0.1),
    p25: percentile(prices, 0.25),
    p75: percentile(prices, 0.75),
    minimumPrice: prices[0] ?? 0,
    listingCount: filtered.length,
    visibleSupply,
    volatility,
    liquidityScore,
    estimatedSaleTimeMs: options.estimatedSaleTimeMs ?? Math.round(86_400_000 / Math.max(liquidityScore * 24, 0.1)),
    fairValue,
    confidence,
    stale,
  };
}
