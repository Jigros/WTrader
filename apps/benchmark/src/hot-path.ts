import { parseTradingConfig } from '@wtrader/config';
import { evaluateOpportunity } from '@wtrader/execution';
import { normalizeItem } from '@wtrader/market-model';
import { calculateMarketStatistics } from '@wtrader/pricing';
import { evaluateRisk } from '@wtrader/risk';

const config = parseTradingConfig({
  capital: { active: 20_000_000, maxTradePercent: 0.25, maxItemExposurePercent: 0.2 },
  trading: { sameDayExitPreferred: true, allowLossSelling: false, minimumAbsoluteProfit: 5_000, dynamicRoi: { base: 0.02, volatilityWeight: 0.5, illiquidityWeight: 0.08, holdingHourWeight: 0.002, lowConfidencePenalty: 0.05, highTurnoverBonus: 0.01, minimum: 0.02, maximum: 0.75 }, minimumConfidence: 'MEDIUM', maxDailyLoss: 1_000_000, maxConsecutiveExecutionFailures: 3 },
  pricing: { emaAlpha: 0.25, outlierIqrMultiplier: 1.5, staleAfterMs: 30_000, minimumSamples: 5 },
  risk: { unknownGuiAction: 'stop', staleMarketAction: 'pause', listingLockTtlMs: 5_000 },
  execution: { allowedCommands: ['/ah'], clickConfirmationRequired: true },
  market: { blacklistedItemTypes: ['minecraft:spawner'] },
  selling: { minimumTick: 1, targetRoi: 0.05, minimumRepricingIntervalMs: 300_000, minimumMeaningfulDelta: 100, maximumRepricesPerHour: 2 },
});
const now = new Date();
const item = { itemType: 'minecraft:diamond', displayName: 'Diamond', quantity: 1, enchantments: [] };
const market = normalizeItem(item);
const listings = Array.from({ length: 20 }, (_, index) => ({
  listingId: `listing-${index}`, item, normalizedItemId: market.marketId, priceTotal: 900_000 + index * 20_000,
  pricePerUnit: 900_000 + index * 20_000, firstSeenAt: now, lastSeenAt: now, auctionPage: 0, auctionSlot: index, rawMetadata: {},
}));
const startedAt = performance.now();
for (let iteration = 0; iteration < 5_000; iteration += 1) {
  const statistics = calculateMarketStatistics(market.marketId, listings.map((listing) => ({ pricePerUnit: listing.pricePerUnit, quantity: 1, observedAt: now })), { ...config.pricing, now });
  const candidate = listings[0];
  if (candidate === undefined) throw new Error('Benchmark listing unavailable');
  const opportunity = evaluateOpportunity(candidate, statistics, config, now);
  if (opportunity !== null) evaluateRisk(opportunity, { accountId: 'benchmark', availableCapital: 20_000_000, dailyRealizedPnl: 0, consecutiveExecutionFailures: 0, positions: [], tradingPaused: false }, config);
}
const elapsed = performance.now() - startedAt;
process.stdout.write(`${JSON.stringify({ iterations: 5000, totalMs: elapsed, perIterationMs: elapsed / 5000 }, null, 2)}\n`);
