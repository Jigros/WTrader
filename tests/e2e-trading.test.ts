import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseTradingConfig } from '@wtrader/config';
import { InMemoryListingLock } from '@wtrader/execution';
import { MockGameClientAdapter } from '@wtrader/game-client';
import { AuctionObserver } from '../apps/market-data/src/observer.js';
import { PurchaseCoordinator } from '../apps/minecraft-executor/src/purchase-coordinator.js';

const config = parseTradingConfig(parse(readFileSync('config/default.yaml', 'utf8')));
const item = (price: number) => ({
  itemType: 'minecraft:diamond', displayName: 'Diamond', quantity: 1, enchantments: [],
  lore: [`Price: ${price}`, 'Seller: MarketMaker'],
});

function parser(lore: readonly string[]) {
  const price = Number(lore.find((line) => line.startsWith('Price: '))?.slice(7));
  const seller = lore.find((line) => line.startsWith('Seller: '))?.slice(8);
  return Number.isFinite(price) ? { priceTotal: price, ...(seller === undefined ? {} : { seller }) } : null;
}

describe('end-to-end mock auction lifecycle', () => {
  it('observes, reserves, purchases, reconciles, and realizes a profitable sale', async () => {
    const observedAt = new Date();
    const prices = [950_000, 975_000, 1_000_000, 1_025_000, 1_050_000, 700_000];
    const gui = MockGameClientAdapter.gui('Auction House', prices.map((price, slot) => ({ slot, item: item(price) })), observedAt);
    const client = new MockGameClientAdapter(20_000_000);
    client.setGui(gui);
    client.registerPurchase({ guiSlot: 5, inventoryItem: item(700_000), price: 700_000 });
    const observer = new AuctionObserver({ titlePattern: /^Auction House$/, listingSlots: [0, 1, 2, 3, 4, 5], page: 0 }, parser, config);
    const observed = observer.observe(gui);
    const opportunity = observed.opportunities.find((candidate) => candidate.listing.auctionSlot === 5);
    if (opportunity === undefined) throw new Error('Expected undervalued listing opportunity');
    const coordinator = new PurchaseCoordinator(client, new InMemoryListingLock(), config);
    const result = await coordinator.purchase(opportunity, {
      accountId: 'mock-account', availableCapital: 20_000_000, dailyRealizedPnl: 0,
      consecutiveExecutionFailures: 0, positions: [], tradingPaused: false,
    }, 'bot-a');
    expect(result.outcome).toBe('CONFIRMED');
    expect(await client.getBalance()).toBe(19_300_000);
    expect((await client.getInventory()).entries).toHaveLength(1);
    client.simulateSale(0, 1_000_000);
    expect(await client.getBalance()).toBe(20_300_000);
    expect((await client.getInventory()).entries).toHaveLength(0);
  });

  it('allows exactly one simulated bot to reserve a listing', async () => {
    const locks = new InMemoryListingLock();
    const [first, second] = await Promise.all([
      locks.acquire('shared-listing', 'bot-a', 5000),
      locks.acquire('shared-listing', 'bot-b', 5000),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});
