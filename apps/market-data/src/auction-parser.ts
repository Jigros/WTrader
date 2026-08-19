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

export function parseDonutPrice(lore: readonly string[]): number | null {
  const values = lore.map(parseCurrency).filter((value): value is number => value !== null);
  return values.length === 1 ? values[0] ?? null : null;
}

export function opaqueListingFingerprint(item: { readonly relevantNbt?: Readonly<Record<string, unknown>>; readonly customMetadata?: Readonly<Record<string, unknown>> }): string | undefined {
  const metadata = { auctionsecurity: item.customMetadata?.['auctionsecurity'] ?? item.relevantNbt?.['auctionsecurity'], components: item.customMetadata ?? item.relevantNbt };
  if (metadata.auctionsecurity === undefined && metadata.components === undefined) return undefined;
  return createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
}

function parseCurrency(value: string): number | null {
  const match = /^\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([KMB])?\s*$/i.exec(value);
  if (match === null) return null;
  const numeric = match[1];
  if (numeric === undefined || (numeric.includes(',') && !/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(numeric))) return null;
  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
  const [whole, fraction = ''] = numeric.replaceAll(',', '').split('.');
  if (whole === undefined || fraction.length > 9) return null;
  const scaled = BigInt(whole) * BigInt(multiplier) + BigInt(fraction.padEnd(9, '0')) * BigInt(multiplier) / 1_000_000_000n;
  return scaled > 0n && scaled <= BigInt(Number.MAX_SAFE_INTEGER) && BigInt(Number(scaled)) === scaled ? Number(scaled) : null;
}

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
    const fingerprint = opaqueListingFingerprint(item);
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
      ...(fingerprint === undefined ? {} : { opaqueListingFingerprint: fingerprint }),
    }];
  });
}
