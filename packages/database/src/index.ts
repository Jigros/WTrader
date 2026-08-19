import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import type { AuctionListing, GameObservation, MarketStatistics, Opportunity } from '@wtrader/shared-types';

export class Database {
  readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000 });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async healthCheck(): Promise<boolean> {
    const result = await this.pool.query<{ healthy: number }>('SELECT 1 AS healthy');
    return result.rows[0]?.healthy === 1;
  }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertListing(listing: AuctionListing): Promise<void> {
    await this.pool.query(
      `INSERT INTO auction_listings (
        id, market_item_id, item_type, display_name, quantity, price_total, price_per_unit,
        seller, first_seen_at, last_seen_at, auction_page, auction_slot, raw_metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at,
        auction_page = EXCLUDED.auction_page, auction_slot = EXCLUDED.auction_slot,
        sold_or_disappeared = false, raw_metadata = EXCLUDED.raw_metadata`,
      [
        listing.listingId, listing.normalizedItemId, listing.item.itemType, listing.item.displayName,
        listing.item.quantity, listing.priceTotal, listing.pricePerUnit, listing.seller ?? null,
        listing.firstSeenAt, listing.lastSeenAt, listing.auctionPage, listing.auctionSlot, listing.rawMetadata,
      ],
    );
  }

  async saveMarketStatistics(statistics: MarketStatistics): Promise<void> {
    await this.pool.query(
      `INSERT INTO market_statistics (
        market_item_id, observed_at, sample_size, weighted_median, rolling_median, ema,
        p10, p25, p75, minimum_price, listing_count, visible_supply, volatility,
        liquidity_score, estimated_sale_time_ms, fair_value, confidence, stale
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        statistics.marketId, statistics.observedAt, statistics.sampleSize, statistics.weightedMedian,
        statistics.rollingMedian, statistics.ema, statistics.p10, statistics.p25, statistics.p75,
        statistics.minimumPrice, statistics.listingCount, statistics.visibleSupply, statistics.volatility,
        statistics.liquidityScore, statistics.estimatedSaleTimeMs, statistics.fairValue,
        statistics.confidence, statistics.stale,
      ],
    );
  }

  async saveOpportunity(opportunity: Opportunity, accountId?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO trade_opportunities (
        id, listing_id, account_id, expected_sell_price, expected_profit, roi,
        expected_holding_time_ms, profit_per_capital_hour, score, confidence, detected_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [
        opportunity.opportunityId, opportunity.listing.listingId, accountId ?? null,
        opportunity.expectedSellPrice, opportunity.expectedProfit, opportunity.roi,
        opportunity.expectedHoldingTimeMs, opportunity.profitPerCapitalHour, opportunity.score,
        opportunity.confidence, opportunity.detectedAt,
      ],
    );
  }

  async saveObservation(observation: GameObservation): Promise<void> {
    await this.pool.query(
      `INSERT INTO system_events (service, event, severity, payload, occurred_at)
       VALUES ('minecraft-executor', $1, 'INFO', $2, $3)`,
      [observation.kind, { sessionId: observation.sessionId, sequence: observation.sequence, payload: observation.payload }, observation.observedAt],
    );
  }
}

export async function runMigrations(database: Database, migrationDirectory = 'database/migrations'): Promise<void> {
  const directory = resolve(migrationDirectory);
  const migrations = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const migration of migrations) {
    const sql = await readFile(resolve(directory, migration), 'utf8');
    await database.pool.query(sql);
  }
}
