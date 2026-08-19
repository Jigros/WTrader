import type { TradingConfig } from '@wtrader/config';
import type { AccountRiskState, Opportunity, RiskDecision } from '@wtrader/shared-types';

const confidenceRank = {
  INSUFFICIENT_DATA: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const;

export function evaluateRisk(
  opportunity: Opportunity,
  state: AccountRiskState,
  config: TradingConfig,
): RiskDecision {
  const reasons: string[] = [];
  const maxTrade = config.capital.active * config.capital.maxTradePercent;
  const maxItemExposure = config.capital.active * config.capital.maxItemExposurePercent;
  const currentExposure = state.positions
    .filter((position) => position.marketId === opportunity.statistics.marketId)
    .reduce((sum, position) => sum + position.acquisitionCost, 0);
  const maxAllowedPrice = Math.max(0, Math.min(maxTrade, maxItemExposure - currentExposure, state.availableCapital));
  if (state.tradingPaused) reasons.push('TRADING_PAUSED');
  if (state.dailyRealizedPnl <= -config.trading.maxDailyLoss) reasons.push('DAILY_LOSS_LIMIT');
  if (state.consecutiveExecutionFailures >= config.trading.maxConsecutiveExecutionFailures) reasons.push('EXECUTION_FAILURE_CIRCUIT_BREAKER');
  if (opportunity.listing.priceTotal > state.availableCapital) reasons.push('INSUFFICIENT_CAPITAL');
  if (opportunity.listing.priceTotal > maxTrade) reasons.push('MAX_TRADE_EXCEEDED');
  if (currentExposure + opportunity.listing.priceTotal > maxItemExposure) reasons.push('MAX_ITEM_EXPOSURE_EXCEEDED');
  if (config.market.blacklistedItemTypes.includes(opportunity.listing.item.itemType)) reasons.push('BLACKLISTED_ITEM');
  if (confidenceRank[opportunity.confidence] < confidenceRank[config.trading.minimumConfidence]) reasons.push('CONFIDENCE_TOO_LOW');
  if (opportunity.statistics.stale) reasons.push('STALE_MARKET');
  return { approved: reasons.length === 0, reasons, maxAllowedPrice };
}
