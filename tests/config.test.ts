import { describe, expect, it } from 'vitest';
import { parseTradingConfig } from '@wtrader/config';

describe('parseTradingConfig', () => {
  it('rejects unsafe loss-selling configuration', () => {
    expect(() => parseTradingConfig({
      capital: { active: 1, maxTradePercent: 0.25, maxItemExposurePercent: 0.2 },
      trading: {
        sameDayExitPreferred: true, allowLossSelling: true, minimumAbsoluteProfit: 1,
        dynamicRoi: { base: 0.1, volatilityWeight: 1, illiquidityWeight: 1, holdingHourWeight: 1, lowConfidencePenalty: 1, highTurnoverBonus: 0, minimum: 0.01, maximum: 1 },
        minimumConfidence: 'MEDIUM', maxDailyLoss: 1, maxConsecutiveExecutionFailures: 1,
      },
      pricing: { emaAlpha: 0.2, outlierIqrMultiplier: 1.5, staleAfterMs: 1, minimumSamples: 1 },
      risk: { unknownGuiAction: 'stop', staleMarketAction: 'pause', listingLockTtlMs: 1 },
      execution: { allowedCommands: ['/ah'], clickConfirmationRequired: true },
      market: { blacklistedItemTypes: [] },
    })).toThrow();
  });
});
