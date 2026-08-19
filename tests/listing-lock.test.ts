import { describe, expect, it } from 'vitest';
import { InMemoryListingLock } from '@wtrader/execution';

describe('InMemoryListingLock', () => {
  it('prevents two accounts from reserving one listing', async () => {
    const locks = new InMemoryListingLock();
    await expect(locks.acquire('listing', 'bot-a', 5000)).resolves.toBe(true);
    await expect(locks.acquire('listing', 'bot-b', 5000)).resolves.toBe(false);
    await expect(locks.release('listing', 'bot-b')).resolves.toBe(false);
    await expect(locks.release('listing', 'bot-a')).resolves.toBe(true);
    await expect(locks.acquire('listing', 'bot-b', 5000)).resolves.toBe(true);
  });
});
