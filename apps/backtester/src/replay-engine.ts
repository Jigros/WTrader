import type { AuctionListing, GameObservation, MarketStatistics } from '@wtrader/shared-types';

export interface SessionReplay {
  readonly sessionId: string;
  readonly observations: readonly GameObservation[];
  readonly listings: readonly AuctionListing[];
  readonly statistics: readonly MarketStatistics[];
}

export interface ReplayEvent {
  readonly observedAt: Date;
  readonly type: 'OBSERVATION' | 'LISTING' | 'STATISTICS';
  readonly payload: GameObservation | AuctionListing | MarketStatistics;
}

export function createReplayTimeline(session: SessionReplay): ReplayEvent[] {
  return [
    ...session.observations.map((payload) => ({ observedAt: payload.observedAt, type: 'OBSERVATION' as const, payload })),
    ...session.listings.map((payload) => ({ observedAt: payload.firstSeenAt, type: 'LISTING' as const, payload })),
    ...session.statistics.map((payload) => ({ observedAt: payload.observedAt, type: 'STATISTICS' as const, payload })),
  ].sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
}

export async function replaySession(
  session: SessionReplay,
  handler: (event: ReplayEvent) => Promise<void> | void,
): Promise<void> {
  for (const event of createReplayTimeline(session)) await handler(event);
}
