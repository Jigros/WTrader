import { randomUUID } from 'node:crypto';
import type { TradingConfig } from '@wtrader/config';
import { type ListingLock } from '@wtrader/execution';
import type { GameClientAdapter } from '@wtrader/game-client';
import { evaluateRisk } from '@wtrader/risk';
import type { AccountRiskState, Opportunity } from '@wtrader/shared-types';
import { type SemanticSlotExpectation, validateSemanticSlot } from './semantic-actions.js';

export type SemanticPurchaseState =
  | 'DETECTED'
  | 'RESERVED'
  | 'VALIDATING'
  | 'OPENING_PURCHASE'
  | 'CONFIRMATION_GUI'
  | 'FINAL_VALIDATION'
  | 'CONFIRM_ACTION_SENT'
  | 'VERIFYING'
  | 'PURCHASED'
  | 'FAILED'
  | 'UNKNOWN';

export interface SemanticPurchaseLayout {
  readonly buy: SemanticSlotExpectation;
  readonly confirmBuy: SemanticSlotExpectation;
}

export interface SemanticPurchaseResult {
  readonly correlationId: string;
  readonly state: SemanticPurchaseState;
  readonly reason?: string;
  readonly balanceAfter: number | null;
}

export class SemanticPurchaseWorkflow {
  constructor(
    private readonly client: GameClientAdapter,
    private readonly locks: ListingLock,
    private readonly config: TradingConfig,
  ) {}

  async purchase(
    opportunity: Opportunity,
    riskState: AccountRiskState,
    botId: string,
    layout: SemanticPurchaseLayout,
  ): Promise<SemanticPurchaseResult> {
    const correlationId = randomUUID();
    let state: SemanticPurchaseState = 'DETECTED';
    if (!await this.locks.acquire(opportunity.listing.listingId, botId, this.config.risk.listingLockTtlMs)) {
      return { correlationId, state: 'FAILED', reason: 'LISTING_ALREADY_RESERVED', balanceAfter: await this.client.getBalance() };
    }
    try {
      state = 'RESERVED';
      const initialGui = await this.client.getCurrentGui();
      const risk = evaluateRisk(opportunity, riskState, this.config);
      if (!risk.approved || initialGui === null) return await this.failure(correlationId, risk.approved ? 'MISSING_AUCTION_GUI' : risk.reasons.join(','));
      state = 'VALIDATING';
      const listingSlot = initialGui.slots.find((slot) => slot.slot === opportunity.listing.auctionSlot);
      if (listingSlot?.item === null || listingSlot?.item === undefined || listingSlot.item.itemType !== opportunity.listing.item.itemType) {
        return await this.failure(correlationId, 'LISTING_ITEM_CHANGED');
      }
      const buyValidation = validateSemanticSlot(initialGui, layout.buy, state);
      if (!buyValidation.approved) return await this.failure(correlationId, buyValidation.reason ?? 'BUY_BUTTON_INVALID');
      const balanceBefore = await this.client.getBalance();
      if (balanceBefore === null || balanceBefore < opportunity.listing.priceTotal) return await this.failure(correlationId, 'INSUFFICIENT_BALANCE');
      state = 'OPENING_PURCHASE';
      const buyResult = await this.client.clickSlot({ slot: layout.buy.slot, expectedSignature: initialGui.signature });
      if (!buyResult.accepted) return await this.failure(correlationId, buyResult.message ?? 'BUY_ACTION_REJECTED');
      const confirmationGui = await this.client.getCurrentGui();
      if (confirmationGui === null) return await this.failure(correlationId, 'MISSING_CONFIRMATION_GUI');
      state = 'CONFIRMATION_GUI';
      state = 'FINAL_VALIDATION';
      const confirmValidation = validateSemanticSlot(confirmationGui, layout.confirmBuy, state);
      if (!confirmValidation.approved) return await this.failure(correlationId, confirmValidation.reason ?? 'CONFIRM_BUTTON_INVALID');
      const currentBalance = await this.client.getBalance();
      if (currentBalance !== balanceBefore) return await this.failure(correlationId, 'BALANCE_CHANGED_BEFORE_CONFIRMATION');
      if (!evaluateRisk(opportunity, riskState, this.config).approved) return await this.failure(correlationId, 'RISK_CHANGED_BEFORE_CONFIRMATION');
      state = 'CONFIRM_ACTION_SENT';
      const confirmResult = await this.client.clickSlot({ slot: layout.confirmBuy.slot, expectedSignature: confirmationGui.signature });
      if (!confirmResult.accepted) return await this.failure(correlationId, confirmResult.message ?? 'CONFIRM_ACTION_REJECTED');
      state = 'VERIFYING';
      const balanceAfter = await this.client.getBalance();
      const inventory = await this.client.getInventory();
      const itemPresent = inventory.entries.some((entry) => entry.item.itemType === opportunity.listing.item.itemType && entry.item.quantity >= opportunity.listing.item.quantity);
      if (balanceAfter === balanceBefore - opportunity.listing.priceTotal && itemPresent) return { correlationId, state: 'PURCHASED', balanceAfter };
      return { correlationId, state: 'UNKNOWN', reason: 'RECONCILIATION_REQUIRED', balanceAfter };
    } finally {
      await this.locks.release(opportunity.listing.listingId, botId);
    }
  }

  private async failure(correlationId: string, reason: string): Promise<SemanticPurchaseResult> {
    return { correlationId, state: 'FAILED', reason, balanceAfter: await this.client.getBalance() };
  }
}
