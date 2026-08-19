export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export type BotState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'READY'
  | 'SCANNING'
  | 'PURCHASING'
  | 'LISTING'
  | 'PAUSED'
  | 'RECOVERING'
  | 'ERROR';

export type ExecutionState =
  | 'DETECTED'
  | 'RESERVED'
  | 'VALIDATING'
  | 'CLICKING'
  | 'CONFIRMING'
  | 'VERIFYING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN';

export interface Enchantment {
  readonly id: string;
  readonly level: number;
}

export interface RawItem {
  readonly itemType: string;
  readonly displayName: string;
  readonly quantity: number;
  readonly durability?: number;
  readonly enchantments: readonly Enchantment[];
  readonly relevantNbt?: Readonly<Record<string, unknown>>;
  readonly customMetadata?: Readonly<Record<string, unknown>>;
  readonly lore?: readonly string[];
}

export interface NormalizedItem {
  readonly marketId: string;
  readonly itemType: string;
  readonly displayName: string;
  readonly quantityClass: number;
  readonly enchantments: readonly Enchantment[];
  readonly identityHash: string;
}

export interface AuctionListing {
  readonly listingId: string;
  readonly item: RawItem;
  readonly normalizedItemId: string;
  readonly priceTotal: number;
  readonly pricePerUnit: number;
  readonly seller?: string;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly auctionPage: number;
  readonly auctionSlot: number;
  readonly rawMetadata: Readonly<Record<string, unknown>>;
}

export interface MarketStatistics {
  readonly marketId: string;
  readonly observedAt: Date;
  readonly sampleSize: number;
  readonly weightedMedian: number;
  readonly rollingMedian: number;
  readonly ema: number;
  readonly p10: number;
  readonly p25: number;
  readonly p75: number;
  readonly minimumPrice: number;
  readonly listingCount: number;
  readonly visibleSupply: number;
  readonly volatility: number;
  readonly liquidityScore: number;
  readonly estimatedSaleTimeMs: number;
  readonly fairValue: number;
  readonly confidence: ConfidenceLevel;
  readonly stale: boolean;
}

export interface Opportunity {
  readonly opportunityId: string;
  readonly listing: AuctionListing;
  readonly statistics: MarketStatistics;
  readonly expectedSellPrice: number;
  readonly expectedProfit: number;
  readonly roi: number;
  readonly expectedHoldingTimeMs: number;
  readonly profitPerCapitalHour: number;
  readonly score: number;
  readonly confidence: ConfidenceLevel;
  readonly detectedAt: Date;
}

export interface PositionExposure {
  readonly marketId: string;
  readonly acquisitionCost: number;
  readonly quantity: number;
}

export interface AccountRiskState {
  readonly accountId: string;
  readonly availableCapital: number;
  readonly dailyRealizedPnl: number;
  readonly consecutiveExecutionFailures: number;
  readonly positions: readonly PositionExposure[];
  readonly tradingPaused: boolean;
}

export interface RiskDecision {
  readonly approved: boolean;
  readonly reasons: readonly string[];
  readonly maxAllowedPrice: number;
}

export type AllowedGameAction =
  | { readonly type: 'RUN_COMMAND'; readonly command: string }
  | { readonly type: 'CLICK_SLOT'; readonly slot: number }
  | { readonly type: 'WAIT'; readonly milliseconds: number }
  | { readonly type: 'OPEN_AH' }
  | { readonly type: 'NEXT_PAGE' }
  | { readonly type: 'PREVIOUS_PAGE' }
  | { readonly type: 'REFRESH' };

export interface GuiSnapshot {
  readonly title: string;
  readonly slotCount: number;
  readonly slots: ReadonlyArray<RawItem | null>;
  readonly observedAt: Date;
}

export interface GameObservation {
  readonly sessionId: string;
  readonly sequence: number;
  readonly kind: 'GUI' | 'CHAT' | 'INVENTORY' | 'BALANCE' | 'DISCONNECT' | 'ACTION_OUTCOME';
  readonly observedAt: Date;
  readonly payload: unknown;
}

export interface ActionOutcome {
  readonly action: AllowedGameAction;
  readonly success: boolean;
  readonly confidence: number;
  readonly before?: GuiSnapshot;
  readonly after?: GuiSnapshot;
  readonly message?: string;
  readonly observedAt: Date;
}

export interface BacktestTrade {
  readonly listingId: string;
  readonly marketId: string;
  readonly boughtAt: Date;
  readonly soldAt: Date | null;
  readonly acquisitionCost: number;
  readonly saleRevenue: number | null;
  readonly realizedProfit: number | null;
}

export interface BacktestResult {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly startingCapital: number;
  readonly endingCapital: number;
  readonly realizedProfit: number;
  readonly unrealizedCost: number;
  readonly trades: readonly BacktestTrade[];
  readonly rejectedOpportunities: number;
}
