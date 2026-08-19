import { EventEmitter } from 'node:events';
import type { AuctionListing, GameObservation, MarketStatistics } from '@wtrader/shared-types';

export interface TradingEvents {
  observation: [GameObservation];
  listing: [AuctionListing];
  statistics: [MarketStatistics];
  pause: [{ reason: string }];
}

export class TradingEventBus extends EventEmitter<TradingEvents> {}
