import { createHash } from 'node:crypto';
import { normalizeItem } from '@wtrader/market-model';
import type { AuctionListing, GuiSnapshot } from '@wtrader/shared-types';

export interface AuctionLayout {
  readonly titlePattern: RegExp;
  readonly listingSlots: readonly number[];
  readonly page: number;
}

export interface ParsedListingMetadata {
  readonly priceTotal: number;
  readonly seller?: string;
  readonly listingId?: string;
}

export type LoreParser = (lore: readonly string[]) => ParsedListingMetadata | null;

export function listingFingerprint(
  marketId: string,
  metadata: ParsedListingMetadata,
  page: number,
  slot: number,
  quantity: number,
): string {
  return createHash('sha256').update(JSON.stringify({
    marketId,
    seller: metadata.seller ?? null,
    priceTotal: metadata.priceTotal,
    page,
    slot,
    quantity,
  })).digest('hex');
}

export function parseAuctionSnapshot(
  snapshot: GuiSnapshot,
  layout: AuctionLayout,
  parseLore: LoreParser,
): AuctionListing[] {
  if (!layout.titlePattern.test(snapshot.title)) return [];
  return layout.listingSlots.flatMap((slot) => {
    const item = snapshot.slots[slot];
    if (item === undefined || item === null || item.lore === undefined) return [];
    const metadata = parseLore(item.lore);
    if (metadata === null || metadata.priceTotal <= 0) return [];
    const normalized = normalizeItem(item);
    return [{
      listingId: metadata.listingId ?? listingFingerprint(normalized.marketId, metadata, layout.page, slot, item.quantity),
      item,
      normalizedItemId: normalized.marketId,
      priceTotal: metadata.priceTotal,
      pricePerUnit: metadata.priceTotal / item.quantity,
      ...(metadata.seller === undefined ? {} : { seller: metadata.seller }),
      firstSeenAt: snapshot.observedAt,
      lastSeenAt: snapshot.observedAt,
      auctionPage: layout.page,
      auctionSlot: slot,
      rawMetadata: { lore: item.lore },
    }];
  });
}
