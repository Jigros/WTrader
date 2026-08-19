import type { TradingConfig } from '@wtrader/config';
import { evaluateOpportunity } from '@wtrader/execution';
import { normalizeItem } from '@wtrader/market-model';
import { calculateMarketStatistics, type PriceObservation } from '@wtrader/pricing';
import type { ClientGuiSnapshot } from '@wtrader/game-client';
import type { AuctionListing, Opportunity } from '@wtrader/shared-types';
import { listingFingerprint, opaqueListingFingerprint, type AuctionLayout, type LoreParser } from './auction-parser.js';
import { HotMarketState, OpportunityQueue } from './hot-market.js';

export interface AuctionObservationResult {
  readonly listings: readonly AuctionListing[];
  readonly opportunities: readonly Opportunity[];
}

export class AuctionObserver {
  readonly hotMarkets = new HotMarketState();
  readonly opportunities = new OpportunityQueue();
  private readonly history = new Map<string, PriceObservation[]>();

  constructor(private readonly layout: AuctionLayout, private readonly parseLore: LoreParser, private readonly config: TradingConfig) {}

  observe(gui: ClientGuiSnapshot): AuctionObservationResult {
    if (!this.layout.titlePattern.test(gui.title)) return { listings: [], opportunities: [] };
    const listings: AuctionListing[] = [];
    const opportunities: Opportunity[] = [];
    for (const slot of this.layout.listingSlots) {
      const entry = gui.slots.find((candidate) => candidate.slot === slot);
      const item = entry?.item;
      if (item === undefined || item === null || item.lore === undefined) continue;
      const metadata = this.parseLore(item.lore);
      if (metadata === null || metadata.priceTotal <= 0) continue;
      const normalized = normalizeItem(item);
      const fingerprint = opaqueListingFingerprint(item);
      const listing: AuctionListing = {
        listingId: metadata.listingId ?? listingFingerprint(normalized.marketId, metadata, this.layout.page, slot, item.quantity),
        item,
        normalizedItemId: normalized.marketId,
        priceTotal: metadata.priceTotal,
        pricePerUnit: metadata.priceTotal / item.quantity,
        ...(metadata.seller === undefined ? {} : { seller: metadata.seller }),
        firstSeenAt: gui.observedAt,
        lastSeenAt: gui.observedAt,
        auctionPage: this.layout.page,
        auctionSlot: slot,
        rawMetadata: { lore: item.lore, sourceGuiId: gui.id },
        ...(fingerprint === undefined ? {} : { opaqueListingFingerprint: fingerprint }),
      };
      const update = this.hotMarkets.upsert(listing);
      listings.push(update.listing);
      const marketListings = this.hotMarkets.listings(normalized.marketId);
      const observed = marketListings.map((candidate) => ({
        pricePerUnit: candidate.pricePerUnit,
        quantity: candidate.item.quantity,
        observedAt: candidate.lastSeenAt,
      }));
      const historic = this.history.get(normalized.marketId) ?? [];
      const statistics = calculateMarketStatistics(normalized.marketId, [...historic, ...observed], {
        emaAlpha: this.config.pricing.emaAlpha,
        outlierIqrMultiplier: this.config.pricing.outlierIqrMultiplier,
        minimumSamples: this.config.pricing.minimumSamples,
        staleAfterMs: this.config.pricing.staleAfterMs,
        now: gui.observedAt,
      });
      this.history.set(normalized.marketId, [...historic, ...observed].slice(-500));
      const opportunity = evaluateOpportunity(listing, statistics, this.config, gui.observedAt);
      if (opportunity !== null) {
        this.opportunities.add(opportunity);
        opportunities.push(opportunity);
      }
    }
    return { listings, opportunities };
  }
}
