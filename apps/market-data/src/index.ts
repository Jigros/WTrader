import type { TradingConfig } from '@wtrader/config';
import { evaluateOpportunity } from '@wtrader/execution';
import { calculateMarketStatistics, type PriceObservation } from '@wtrader/pricing';
import type { AuctionListing, MarketStatistics, Opportunity } from '@wtrader/shared-types';

export interface MarketEvaluation {
  readonly statistics: MarketStatistics;
  readonly opportunities: readonly Opportunity[];
}

export function evaluateMarket(
  marketId: string,
  listings: readonly AuctionListing[],
  history: readonly PriceObservation[],
  config: TradingConfig,
  previousEma?: number,
  now = new Date(),
): MarketEvaluation {
  const observations = [
    ...history,
    ...listings.map((listing) => ({
      pricePerUnit: listing.pricePerUnit,
      quantity: listing.item.quantity,
      observedAt: listing.lastSeenAt,
    })),
  ];
  const statistics = calculateMarketStatistics(marketId, observations, {
    emaAlpha: config.pricing.emaAlpha,
    outlierIqrMultiplier: config.pricing.outlierIqrMultiplier,
    minimumSamples: config.pricing.minimumSamples,
    staleAfterMs: config.pricing.staleAfterMs,
    now,
    ...(previousEma === undefined ? {} : { previousEma }),
  });
  const opportunities = listings
    .map((listing) => evaluateOpportunity(listing, statistics, config, now))
    .filter((opportunity): opportunity is Opportunity => opportunity !== null)
    .sort((left, right) => right.score - left.score);
  return { statistics, opportunities };
}
