import { describe, expect, it } from 'vitest';
import { listingFingerprint } from '../apps/market-data/src/auction-parser.js';

describe('listingFingerprint', () => {
  it('is stable for repeated observations and distinct for changed price', () => {
    const first = listingFingerprint('market', { priceTotal: 100, seller: 'Alice' }, 1, 2, 4);
    const repeated = listingFingerprint('market', { priceTotal: 100, seller: 'Alice' }, 1, 2, 4);
    const repriced = listingFingerprint('market', { priceTotal: 101, seller: 'Alice' }, 1, 2, 4);
    expect(first).toBe(repeated);
    expect(first).not.toBe(repriced);
  });
});
