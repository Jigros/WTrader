import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseTradingConfig } from '@wtrader/config';
import { InMemoryListingLock } from '@wtrader/execution';
import { MockGameClientAdapter } from '@wtrader/game-client';
import { SemanticPurchaseWorkflow } from '../apps/minecraft-executor/src/semantic-purchase-workflow.js';
import type { Opportunity } from '@wtrader/shared-types';

const config = parseTradingConfig(parse(readFileSync('config/default.yaml', 'utf8')));
const listingItem = { itemType: 'minecraft:diamond', displayName: 'Diamond', quantity: 1, enchantments: [] };
const opportunity = {
  opportunityId: 'opportunity', listing: { listingId: 'listing', item: listingItem, normalizedItemId: 'diamond', priceTotal: 700_000, pricePerUnit: 700_000, firstSeenAt: new Date(), lastSeenAt: new Date(), auctionPage: 0, auctionSlot: 1, rawMetadata: {} },
  statistics: { marketId: 'diamond', observedAt: new Date(), sampleSize: 20, weightedMedian: 1_000_000, rollingMedian: 1_000_000, ema: 1_000_000, p10: 900_000, p25: 950_000, p75: 1_050_000, minimumPrice: 700_000, listingCount: 20, visibleSupply: 100, volatility: 0.1, liquidityScore: 0.9, estimatedSaleTimeMs: 3_600_000, fairValue: 1_000_000, confidence: 'HIGH' as const, stale: false },
  expectedSellPrice: 1_000_000, expectedProfit: 300_000, roi: 0.42, expectedHoldingTimeMs: 3_600_000, profitPerCapitalHour: 0.42, score: 0.3, confidence: 'HIGH' as const, detectedAt: new Date(),
} satisfies Opportunity;

describe('SemanticPurchaseWorkflow', () => {
  it('fails safely instead of clicking a changed semantic button', async () => {
    const client = new MockGameClientAdapter(20_000_000);
    const gui = MockGameClientAdapter.gui('Auction', [
      { slot: 0, item: { itemType: 'minecraft:barrier', displayName: 'Cancel', quantity: 1, enchantments: [] } },
      { slot: 1, item: listingItem },
    ]);
    client.setGui(gui);
    const workflow = new SemanticPurchaseWorkflow(client, new InMemoryListingLock(), config);
    const result = await workflow.purchase(opportunity, { accountId: 'account', availableCapital: 20_000_000, dailyRealizedPnl: 0, consecutiveExecutionFailures: 0, positions: [], tradingPaused: false }, 'bot', {
      buy: { action: 'BUY', guiSignature: gui.signature, slot: 0, expectedItemType: 'minecraft:lime_dye', workflowStates: ['VALIDATING'], confidence: 1 },
      confirmBuy: { action: 'CONFIRM_BUY', guiSignature: 'unused', slot: 0, workflowStates: ['FINAL_VALIDATION'], confidence: 1 },
    });
    expect(result.state).toBe('FAILED');
    expect(result.reason).toBe('BUTTON_ITEM_TYPE_MISMATCH');
  });
});
