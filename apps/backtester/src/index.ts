import type { TradingConfig } from '@wtrader/config';
import { evaluateOpportunity } from '@wtrader/execution';
import { evaluateRisk } from '@wtrader/risk';
import type {
  AccountRiskState,
  AuctionListing,
  BacktestResult,
  BacktestTrade,
  MarketStatistics,
} from '@wtrader/shared-types';

export interface HistoricalFrame {
  readonly observedAt: Date;
  readonly listings: readonly AuctionListing[];
  readonly statistics: Readonly<Record<string, MarketStatistics>>;
  readonly disappearedListingIds: readonly string[];
}

interface OpenBacktestPosition {
  readonly listingId: string;
  readonly marketId: string;
  readonly boughtAt: Date;
  readonly acquisitionCost: number;
  readonly expectedSellPrice: number;
}

export function runBacktest(frames: readonly HistoricalFrame[], config: TradingConfig): BacktestResult {
  const ordered = [...frames].sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
  let capital = config.capital.active;
  let rejectedOpportunities = 0;
  const open = new Map<string, OpenBacktestPosition>();
  const trades: BacktestTrade[] = [];
  for (const frame of ordered) {
    for (const listingId of frame.disappearedListingIds) {
      const position = open.get(listingId);
      if (position === undefined) continue;
      capital += position.expectedSellPrice;
      trades.push({
        listingId,
        marketId: position.marketId,
        boughtAt: position.boughtAt,
        soldAt: frame.observedAt,
        acquisitionCost: position.acquisitionCost,
        saleRevenue: position.expectedSellPrice,
        realizedProfit: position.expectedSellPrice - position.acquisitionCost,
      });
      open.delete(listingId);
    }
    for (const listing of frame.listings) {
      if (open.has(listing.listingId)) continue;
      const statistics = frame.statistics[listing.normalizedItemId];
      if (statistics === undefined) continue;
      const opportunity = evaluateOpportunity(listing, statistics, config, frame.observedAt);
      if (opportunity === null) continue;
      const state: AccountRiskState = {
        accountId: 'backtest',
        availableCapital: capital,
        dailyRealizedPnl: trades.reduce((sum, trade) => sum + (trade.realizedProfit ?? 0), 0),
        consecutiveExecutionFailures: 0,
        positions: [...open.values()].map((position) => ({
          marketId: position.marketId,
          acquisitionCost: position.acquisitionCost,
          quantity: 1,
        })),
        tradingPaused: false,
      };
      const decision = evaluateRisk(opportunity, state, config);
      if (!decision.approved) {
        rejectedOpportunities += 1;
        continue;
      }
      capital -= listing.priceTotal;
      open.set(listing.listingId, {
        listingId: listing.listingId,
        marketId: listing.normalizedItemId,
        boughtAt: frame.observedAt,
        acquisitionCost: listing.priceTotal,
        expectedSellPrice: opportunity.expectedSellPrice * listing.item.quantity,
      });
    }
  }
  for (const position of open.values()) {
    trades.push({
      listingId: position.listingId,
      marketId: position.marketId,
      boughtAt: position.boughtAt,
      soldAt: null,
      acquisitionCost: position.acquisitionCost,
      saleRevenue: null,
      realizedProfit: null,
    });
  }
  const unrealizedCost = [...open.values()].reduce((sum, position) => sum + position.acquisitionCost, 0);
  const realizedProfit = trades.reduce((sum, trade) => sum + (trade.realizedProfit ?? 0), 0);
  return {
    startedAt: ordered[0]?.observedAt ?? new Date(0),
    endedAt: ordered.at(-1)?.observedAt ?? new Date(0),
    startingCapital: config.capital.active,
    endingCapital: capital,
    realizedProfit,
    unrealizedCost,
    trades,
    rejectedOpportunities,
  };
}
