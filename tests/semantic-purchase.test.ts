import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseTradingConfig } from '@wtrader/config';
import { InMemoryListingLock } from '@wtrader/execution';
import { MockGameClientAdapter } from '@wtrader/game-client';
import { LiveBuyTestMode } from '../apps/minecraft-executor/src/live-buy-test-mode.js';
import { SemanticPurchaseWorkflow } from '../apps/minecraft-executor/src/semantic-purchase-workflow.js';
import type { Opportunity } from '@wtrader/shared-types';

const config = parseTradingConfig(parse(readFileSync('config/default.yaml', 'utf8')));
const listingItem = { itemType: 'minecraft:diamond', displayName: 'Diamond', quantity: 1, enchantments: [], lore: ['$ 700K'] };
const riskState = { accountId: 'account', availableCapital: 20_000_000, dailyRealizedPnl: 0, consecutiveExecutionFailures: 0, positions: [], tradingPaused: false };

function opportunity(slot = 1): Opportunity {
  return {
    opportunityId: 'opportunity', listing: { listingId: 'listing', item: listingItem, normalizedItemId: 'diamond', priceTotal: 700_000, pricePerUnit: 700_000, firstSeenAt: new Date(), lastSeenAt: new Date(), auctionPage: 0, auctionSlot: slot, rawMetadata: {} },
    statistics: { marketId: 'diamond', observedAt: new Date(), sampleSize: 20, weightedMedian: 1_000_000, rollingMedian: 1_000_000, ema: 1_000_000, p10: 900_000, p25: 950_000, p75: 1_050_000, minimumPrice: 700_000, listingCount: 20, visibleSupply: 100, volatility: 0.1, liquidityScore: 0.9, estimatedSaleTimeMs: 3_600_000, fairValue: 1_000_000, confidence: 'HIGH', stale: false },
    expectedSellPrice: 1_000_000, expectedProfit: 300_000, roi: 0.42, expectedHoldingTimeMs: 3_600_000, profitPerCapitalHour: 0.42, score: 0.3, confidence: 'HIGH', detectedAt: new Date(),
  };
}

function gui(title: string, windowType: string, slotCount: number, slots: Parameters<typeof MockGameClientAdapter.gui>[1]) {
  return { ...MockGameClientAdapter.gui(title, slots), windowType, slotCount };
}

function confirmationGui() {
  return gui('Confirm Purchase', 'minecraft:generic_9x3', 63, [
    { slot: 11, item: { itemType: 'minecraft:red_stained_glass_pane', displayName: 'Cancel', quantity: 1, enchantments: [] } },
    { slot: 13, item: listingItem },
    { slot: 15, item: { itemType: 'minecraft:lime_stained_glass_pane', displayName: 'Confirm', quantity: 1, enchantments: [] } },
  ]);
}

describe('SemanticPurchaseWorkflow', () => {
  it('clicks the observed opportunity listing slot then guarded confirmation', async () => {
    const client = new MockGameClientAdapter(20_000_000);
    client.setGui(gui('Auction (Page 1)', 'minecraft:generic_9x6', 90, [{ slot: 1, item: listingItem }]));
    client.registerPurchase({ guiSlot: 1, inventoryItem: listingItem, price: 700_000, confirmationGui: confirmationGui(), postPurchaseGui: gui('Auction (Page 1)', 'minecraft:generic_9x6', 90, []) });
    const result = await new SemanticPurchaseWorkflow(client, new InMemoryListingLock(), config).purchase(opportunity(), riskState, 'bot', {});
    expect(result.state).toBe('PURCHASED');
    expect(result.balanceAfter).toBe(19_300_000);
  });

  it('requires all post-confirmation evidence before marking a purchase confirmed', async () => {
    const client = new MockGameClientAdapter(20_000_000);
    client.setGui(gui('Auction (Page 1)', 'minecraft:generic_9x6', 90, [{ slot: 1, item: listingItem }]));
    client.registerPurchase({ guiSlot: 1, inventoryItem: listingItem, price: 700_000, confirmationGui: confirmationGui() });
    const result = await new SemanticPurchaseWorkflow(client, new InMemoryListingLock(), config).purchase(opportunity(), riskState, 'bot', {});
    expect(result.state).toBe('UNKNOWN');
    expect(result.evidence?.listingState).toBe('UNAVAILABLE');
  });

  it('persists an unknown result and blocks further financial actions', async () => {
    const client = new MockGameClientAdapter(20_000_000);
    client.setGui(gui('Auction (Page 1)', 'minecraft:generic_9x6', 90, [{ slot: 1, item: listingItem }]));
    client.registerPurchase({ guiSlot: 1, inventoryItem: listingItem, price: 700_000, confirmationGui: confirmationGui() });
    const persisted: unknown[] = [];
    const testConfig = parseTradingConfig({ ...config, execution: { ...config.execution, safetyMode: 'LIVE', liveBuyTest: { executeOnce: true, maxPrice: 700_000 } } });
    const mode = new LiveBuyTestMode(new SemanticPurchaseWorkflow(client, new InMemoryListingLock(), testConfig), { savePurchaseAttempt: (attempt) => { persisted.push(attempt); return Promise.resolve(); } }, testConfig);
    const result = await mode.execute(opportunity(), riskState, 'bot');
    expect(result.state).toBe('UNKNOWN');
    expect(persisted).toHaveLength(1);
    await expect(mode.execute(opportunity(), riskState, 'bot')).rejects.toThrow('FINANCIAL_ACTIONS_STOPPED');
  });

  it('treats an empty listing slot as sold or removed', async () => {
    const client = new MockGameClientAdapter(20_000_000);
    client.setGui(gui('Auction (Page 1)', 'minecraft:generic_9x6', 90, []));
    const result = await new SemanticPurchaseWorkflow(client, new InMemoryListingLock(), config).purchase(opportunity(), riskState, 'bot', {});
    expect(result.reason).toBe('LISTING_SOLD_OR_REMOVED');
  });

  it('rejects an opportunity outside observed listing slots', async () => {
    const client = new MockGameClientAdapter(20_000_000);
    client.setGui(gui('Auction (Page 1)', 'minecraft:generic_9x6', 90, [{ slot: 49, item: listingItem }]));
    const result = await new SemanticPurchaseWorkflow(client, new InMemoryListingLock(), config).purchase(opportunity(49), riskState, 'bot', {});
    expect(result.reason).toBe('STALE_OR_UNSUPPORTED_AUCTION_GUI');
  });
});
