import type { Redis } from 'ioredis';

export interface ListingLock {
  acquire(listingId: string, ownerId: string, ttlMs: number): Promise<boolean>;
  release(listingId: string, ownerId: string): Promise<boolean>;
}

export class InMemoryListingLock implements ListingLock {
  private readonly locks = new Map<string, { ownerId: string; expiresAt: number }>();

  acquire(listingId: string, ownerId: string, ttlMs: number): Promise<boolean> {
    const existing = this.locks.get(listingId);
    if (existing !== undefined && existing.expiresAt > Date.now()) return Promise.resolve(false);
    this.locks.set(listingId, { ownerId, expiresAt: Date.now() + ttlMs });
    return Promise.resolve(true);
  }

  release(listingId: string, ownerId: string): Promise<boolean> {
    const existing = this.locks.get(listingId);
    if (existing?.ownerId !== ownerId) return Promise.resolve(false);
    return Promise.resolve(this.locks.delete(listingId));
  }
}

export class RedisListingLock implements ListingLock {
  constructor(private readonly redis: Redis, private readonly prefix = 'listing-lock:') {}

  async acquire(listingId: string, ownerId: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(`${this.prefix}${listingId}`, ownerId, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async release(listingId: string, ownerId: string): Promise<boolean> {
    const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    return await this.redis.eval(script, 1, `${this.prefix}${listingId}`, ownerId) === 1;
  }
}
