import type { AuctionListing, Opportunity } from '@wtrader/shared-types';

export class OpportunityQueue {
  private readonly entries = new Map<string, Opportunity>();

  add(opportunity: Opportunity): void {
    this.entries.set(opportunity.listing.listingId, opportunity);
  }

  remove(listingId: string): void {
    this.entries.delete(listingId);
  }

  next(now = new Date(), maxAgeMs = 30_000): Opportunity | null {
    const candidates = [...this.entries.values()]
      .filter((entry) => now.getTime() - entry.detectedAt.getTime() <= maxAgeMs)
      .sort((left, right) => right.score - left.score || right.expectedProfit - left.expectedProfit || left.expectedHoldingTimeMs - right.expectedHoldingTimeMs);
    return candidates[0] ?? null;
  }
}

export class HotMarketState {
  private readonly listingsByMarket = new Map<string, Map<string, AuctionListing>>();

  upsert(listing: AuctionListing): { isNew: boolean; listing: AuctionListing } {
    const market = this.listingsByMarket.get(listing.normalizedItemId) ?? new Map<string, AuctionListing>();
    const prior = market.get(listing.listingId);
    market.set(listing.listingId, listing);
    this.listingsByMarket.set(listing.normalizedItemId, market);
    return { isNew: prior === undefined, listing };
  }

  listings(marketId: string): AuctionListing[] {
    return [...(this.listingsByMarket.get(marketId)?.values() ?? [])];
  }

  all(): AuctionListing[] {
    return [...this.listingsByMarket.values()].flatMap((market) => [...market.values()]);
  }
}
