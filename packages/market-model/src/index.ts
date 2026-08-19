import { createHash } from 'node:crypto';
import type { Enchantment, NormalizedItem, RawItem } from '@wtrader/shared-types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function normalizeEnchantments(enchantments: readonly Enchantment[]): Enchantment[] {
  return [...enchantments]
    .map(({ id, level }) => ({ id: id.toLowerCase().trim(), level }))
    .sort((left, right) => left.id.localeCompare(right.id) || left.level - right.level);
}

export function normalizeItem(item: RawItem): NormalizedItem {
  const identity = canonicalize({
    itemType: item.itemType.toLowerCase().trim(),
    displayName: item.displayName.trim().replace(/§[0-9A-FK-OR]/gi, ''),
    durability: item.durability ?? null,
    enchantments: normalizeEnchantments(item.enchantments),
    relevantNbt: item.relevantNbt ?? {},
    customMetadata: item.customMetadata ?? {},
  });
  const serialized = JSON.stringify(identity);
  const identityHash = createHash('sha256').update(serialized).digest('hex');
  return {
    marketId: `${item.itemType.toLowerCase().trim()}:${identityHash.slice(0, 20)}`,
    itemType: item.itemType.toLowerCase().trim(),
    displayName: item.displayName.trim().replace(/§[0-9A-FK-OR]/gi, ''),
    quantityClass: item.quantity,
    enchantments: normalizeEnchantments(item.enchantments),
    identityHash,
  };
}
