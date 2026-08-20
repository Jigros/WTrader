import { randomUUID } from 'node:crypto';
import type { TradingConfig } from '@wtrader/config';
import { type ListingLock } from '@wtrader/execution';
import type { GameClientAdapter } from '@wtrader/game-client';
import { evaluateRisk } from '@wtrader/risk';
import type { AccountRiskState, Opportunity } from '@wtrader/shared-types';
import { type GuiAction, type GuiProfile, validateProfileAction } from './gui-profile.js';
import { donutGuiProfile, isDonutAuctionPage, isDonutPurchaseConfirmation } from './donut-gui-profile.js';
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
  readonly profile?: GuiProfile;
  readonly confirmAction?: GuiAction;
}

export interface PurchaseVerificationEvidence {
  readonly balanceBefore: number | null;
  readonly balanceAfter: number | null;
  readonly inventoryQuantityBefore: number;
  readonly inventoryQuantityAfter: number;
  readonly confirmationWindowObserved: boolean;
  readonly listingState: 'REMOVED' | 'PRESENT' | 'UNAVAILABLE';
}

export interface SemanticPurchaseResult {
  readonly correlationId: string;
  readonly state: SemanticPurchaseState;
  readonly reason?: string;
  readonly balanceAfter: number | null;
  readonly evidence?: PurchaseVerificationEvidence;
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
      const profile = layout.profile ?? donutGuiProfile;
      if (!isDonutAuctionPage(initialGui) || !profile.matchesWindow(initialGui) || !profile.listingSlots(initialGui).includes(opportunity.listing.auctionSlot)) return await this.failure(correlationId, 'STALE_OR_UNSUPPORTED_AUCTION_GUI');
      const listingSlot = initialGui.slots.find((slot) => slot.slot === opportunity.listing.auctionSlot);
      if (listingSlot?.item === null || listingSlot?.item === undefined) return await this.failure(correlationId, 'LISTING_SOLD_OR_REMOVED');
      if (listingSlot.item.itemType !== opportunity.listing.item.itemType || listingSlot.item.quantity !== opportunity.listing.item.quantity) return await this.failure(correlationId, 'LISTING_CHANGED');
      const livePrice = listingSlot.item.lore === undefined ? null : parseDonutPrice(listingSlot.item.lore);
      if (livePrice !== opportunity.listing.priceTotal) return await this.failure(correlationId, 'LISTING_PRICE_CHANGED');
      const liveFingerprint = opaqueListingFingerprint(listingSlot.item);
      if (opportunity.listing.opaqueListingFingerprint !== undefined && liveFingerprint !== opportunity.listing.opaqueListingFingerprint) return await this.failure(correlationId, 'LISTING_FINGERPRINT_MISMATCH');
      const balanceBefore = await this.client.getBalance();
      const inventoryBefore = await this.client.getInventory();
      const inventoryQuantityBefore = this.itemQuantity(inventoryBefore, opportunity);
      if (balanceBefore === null || balanceBefore < opportunity.listing.priceTotal) return await this.failure(correlationId, 'INSUFFICIENT_BALANCE');
      const buyResult = await this.client.clickSlot({ slot: opportunity.listing.auctionSlot, expectedSignature: initialGui.signature });
      if (!buyResult.accepted) return await this.failure(correlationId, buyResult.message === 'Listing unavailable' ? 'LISTING_SOLD_OR_REMOVED' : buyResult.message ?? 'LISTING_CLICK_REJECTED');
      const confirmationGui = await this.client.getCurrentGui();
      if (confirmationGui === null) return await this.failure(correlationId, 'MISSING_CONFIRMATION_GUI');
      if (!isDonutPurchaseConfirmation(confirmationGui) || !profile.matchesWindow(confirmationGui)) return await this.failure(correlationId, 'INVALID_CONFIRMATION_GUI');
      const preview = confirmationGui.slots.find((slot) => slot.slot === 13)?.item;
      if (preview === undefined || preview === null || preview.itemType !== opportunity.listing.item.itemType || preview.quantity !== opportunity.listing.item.quantity) return await this.failure(correlationId, 'CONFIRMATION_PREVIEW_MISMATCH');
      const previewPrice = preview.lore === undefined ? null : parseDonutPrice(preview.lore);
      if (previewPrice !== opportunity.listing.priceTotal) return await this.failure(correlationId, 'CONFIRMATION_PRICE_MISMATCH');
      const previewFingerprint = opaqueListingFingerprint(preview);
      if (opportunity.listing.opaqueListingFingerprint !== undefined && previewFingerprint !== undefined && previewFingerprint !== opportunity.listing.opaqueListingFingerprint) return await this.failure(correlationId, 'CONFIRMATION_FINGERPRINT_MISMATCH');
      const confirmAction = layout.confirmAction ?? 'CONFIRM_BUY';
      const confirmSlot = validateProfileAction(profile, confirmAction, confirmationGui);
      if (confirmSlot === null) return await this.failure(correlationId, 'CONFIRM_PROFILE_ACTION_INVALID');
      const currentBalance = await this.client.getBalance();
      if (currentBalance !== balanceBefore) return await this.failure(correlationId, 'BALANCE_CHANGED_BEFORE_CONFIRMATION');
      if (!evaluateRisk(opportunity, riskState, this.config).approved) return await this.failure(correlationId, 'RISK_CHANGED_BEFORE_CONFIRMATION');
      const confirmResult = await this.client.clickSlot({ slot: confirmSlot.slot, expectedSignature: confirmationGui.signature, ...(confirmSlot.expectedItemFingerprint === undefined ? {} : { expectedItemFingerprint: confirmSlot.expectedItemFingerprint }) });
      if (!confirmResult.accepted) return await this.failure(correlationId, confirmResult.message ?? 'CONFIRM_ACTION_REJECTED');
      const balanceAfter = await this.client.getBalance();
      const inventoryAfter = await this.client.getInventory();
      const inventoryQuantityAfter = this.itemQuantity(inventoryAfter, opportunity);
      const finalGui = await this.client.getCurrentGui();
      const finalListing = finalGui?.slots.find((slot) => slot.slot === opportunity.listing.auctionSlot)?.item;
      const evidence: PurchaseVerificationEvidence = {
        balanceBefore,
        balanceAfter,
        inventoryQuantityBefore,
        inventoryQuantityAfter,
        confirmationWindowObserved: true,
        listingState: finalGui === null || !isDonutAuctionPage(finalGui) ? 'UNAVAILABLE' : finalListing === null || finalListing === undefined ? 'REMOVED' : 'PRESENT',
      };
      const balanceDebited = balanceAfter === balanceBefore - opportunity.listing.priceTotal;
      const inventoryIncreased = inventoryQuantityAfter >= inventoryQuantityBefore + opportunity.listing.item.quantity;
      if (balanceDebited && inventoryIncreased && evidence.listingState === 'REMOVED') return { correlationId, state: 'PURCHASED', balanceAfter, evidence };
      return { correlationId, state: 'UNKNOWN', reason: 'RECONCILIATION_REQUIRED', balanceAfter, evidence };
    } finally {
      await this.locks.release(opportunity.listing.listingId, botId);
    }
  }

  private itemQuantity(inventory: Awaited<ReturnType<GameClientAdapter['getInventory']>>, opportunity: Opportunity): number {
    return inventory.entries.filter((entry) => entry.item.itemType === opportunity.listing.item.itemType).reduce((total, entry) => total + entry.item.quantity, 0);
  }

  private async failure(correlationId: string, reason: string): Promise<SemanticPurchaseResult> {
    return { correlationId, state: 'FAILED', reason, balanceAfter: await this.client.getBalance() };
  }
}
