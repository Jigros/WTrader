import { randomUUID } from 'node:crypto';
import type { TradingConfig } from '@wtrader/config';
import { type ListingLock } from '@wtrader/execution';
import type { GameClientAdapter } from '@wtrader/game-client';
import { evaluateRisk } from '@wtrader/risk';
import type { AccountRiskState, Opportunity } from '@wtrader/shared-types';
import { type GuiAction, type GuiProfile, validateProfileAction } from './gui-profile.js';
import { opaqueListingFingerprint, parseDonutPrice } from '../../market-data/src/auction-parser.js';

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
  readonly profile: GuiProfile;
  readonly buyAction?: GuiAction;
  readonly confirmAction?: GuiAction;
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
    if (!await this.locks.acquire(opportunity.listing.listingId, botId, this.config.risk.listingLockTtlMs)) {
      return { correlationId, state: 'FAILED', reason: 'LISTING_ALREADY_RESERVED', balanceAfter: await this.client.getBalance() };
    }
    try {
      const initialGui = await this.client.getCurrentGui();
      const risk = evaluateRisk(opportunity, riskState, this.config);
      if (!risk.approved || initialGui === null) return await this.failure(correlationId, risk.approved ? 'MISSING_AUCTION_GUI' : risk.reasons.join(','));
      const listingSlot = initialGui.slots.find((slot) => slot.slot === opportunity.listing.auctionSlot);
      if (listingSlot?.item === null || listingSlot?.item === undefined || listingSlot.item.itemType !== opportunity.listing.item.itemType) {
        return await this.failure(correlationId, 'LISTING_ITEM_CHANGED');
      }
      const buyAction = layout.buyAction ?? 'BUY';
      const buySlot = validateProfileAction(layout.profile, buyAction, initialGui);
      if (buySlot === null) return await this.failure(correlationId, 'BUY_PROFILE_ACTION_INVALID');
      const balanceBefore = await this.client.getBalance();
      if (balanceBefore === null || balanceBefore < opportunity.listing.priceTotal) return await this.failure(correlationId, 'INSUFFICIENT_BALANCE');
      const buyResult = await this.client.clickSlot({ slot: buySlot.slot, expectedSignature: initialGui.signature, ...(buySlot.expectedItemFingerprint === undefined ? {} : { expectedItemFingerprint: buySlot.expectedItemFingerprint }) });
      if (!buyResult.accepted) return await this.failure(correlationId, buyResult.message ?? 'BUY_ACTION_REJECTED');
      const confirmationGui = await this.client.getCurrentGui();
      if (confirmationGui === null) return await this.failure(correlationId, 'MISSING_CONFIRMATION_GUI');
      if (!layout.profile.matchesWindow(confirmationGui)) return await this.failure(correlationId, 'INVALID_CONFIRMATION_GUI');
      const preview = confirmationGui.slots.find((slot) => slot.slot === 13)?.item;
      if (preview === undefined || preview === null || preview.itemType !== opportunity.listing.item.itemType || preview.quantity !== opportunity.listing.item.quantity) return await this.failure(correlationId, 'CONFIRMATION_PREVIEW_MISMATCH');
      const previewPrice = preview.lore === undefined ? null : parseDonutPrice(preview.lore);
      if (previewPrice !== opportunity.listing.priceTotal) return await this.failure(correlationId, 'CONFIRMATION_PRICE_MISMATCH');
      const previewFingerprint = opaqueListingFingerprint(preview);
      if (opportunity.listing.opaqueListingFingerprint !== undefined && previewFingerprint !== undefined && previewFingerprint !== opportunity.listing.opaqueListingFingerprint) return await this.failure(correlationId, 'CONFIRMATION_FINGERPRINT_MISMATCH');
      const confirmAction = layout.confirmAction ?? 'CONFIRM_BUY';
      const confirmSlot = validateProfileAction(layout.profile, confirmAction, confirmationGui);
      if (confirmSlot === null) return await this.failure(correlationId, 'CONFIRM_PROFILE_ACTION_INVALID');
      const currentBalance = await this.client.getBalance();
      if (currentBalance !== balanceBefore) return await this.failure(correlationId, 'BALANCE_CHANGED_BEFORE_CONFIRMATION');
      if (!evaluateRisk(opportunity, riskState, this.config).approved) return await this.failure(correlationId, 'RISK_CHANGED_BEFORE_CONFIRMATION');
      const confirmResult = await this.client.clickSlot({ slot: confirmSlot.slot, expectedSignature: confirmationGui.signature, ...(confirmSlot.expectedItemFingerprint === undefined ? {} : { expectedItemFingerprint: confirmSlot.expectedItemFingerprint }) });
      if (!confirmResult.accepted) return await this.failure(correlationId, confirmResult.message ?? 'CONFIRM_ACTION_REJECTED');
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
