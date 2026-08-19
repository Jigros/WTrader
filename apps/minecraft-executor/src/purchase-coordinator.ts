import { randomUUID } from 'node:crypto';
import type { TradingConfig } from '@wtrader/config';
import { ExecutionMachine, type ListingLock } from '@wtrader/execution';
import type { GameClientAdapter } from '@wtrader/game-client';
import { evaluateRisk } from '@wtrader/risk';
import type { AccountRiskState, Opportunity } from '@wtrader/shared-types';

export type PurchaseOutcome = 'CONFIRMED' | 'FAILED' | 'UNKNOWN';

export interface PurchaseResult {
  readonly correlationId: string;
  readonly outcome: PurchaseOutcome;
  readonly state: string;
  readonly reason?: string;
  readonly balanceAfter: number | null;
}

export class PurchaseCoordinator {
  constructor(
    private readonly client: GameClientAdapter,
    private readonly locks: ListingLock,
    private readonly config: TradingConfig,
  ) {}

  async purchase(opportunity: Opportunity, state: AccountRiskState, botId: string): Promise<PurchaseResult> {
    const correlationId = randomUUID();
    const machine = new ExecutionMachine();
    if (!await this.locks.acquire(opportunity.listing.listingId, botId, this.config.risk.listingLockTtlMs)) {
      return { correlationId, outcome: 'FAILED', state: machine.state, reason: 'LISTING_ALREADY_RESERVED', balanceAfter: await this.client.getBalance() };
    }
    try {
      machine.transition('RESERVE');
      const risk = evaluateRisk(opportunity, state, this.config);
      const gui = await this.client.getCurrentGui();
      if (!risk.approved || gui === null || gui.observedAt.getTime() !== opportunity.listing.lastSeenAt.getTime()) {
        machine.transition('FAIL');
        return { correlationId, outcome: 'FAILED', state: machine.state, reason: risk.approved ? 'STALE_OR_MISSING_GUI' : risk.reasons.join(','), balanceAfter: await this.client.getBalance() };
      }
      machine.transition('VALIDATE');
      const slot = gui.slots.find((candidate) => candidate.slot === opportunity.listing.auctionSlot);
      if (slot?.item === null || slot?.item === undefined || slot.item.itemType !== opportunity.listing.item.itemType) {
        machine.transition('FAIL');
        return { correlationId, outcome: 'FAILED', state: machine.state, reason: 'LISTING_CHANGED', balanceAfter: await this.client.getBalance() };
      }
      const balanceBefore = await this.client.getBalance();
      if (balanceBefore === null || balanceBefore < opportunity.listing.priceTotal) {
        machine.transition('FAIL');
        return { correlationId, outcome: 'FAILED', state: machine.state, reason: 'INSUFFICIENT_BALANCE', balanceAfter: balanceBefore };
      }
      machine.transition('CLICK');
      const result = await this.client.clickSlot({ slot: opportunity.listing.auctionSlot, expectedSignature: gui.signature });
      if (!result.accepted) {
        machine.transition('FAIL');
        return { correlationId, outcome: 'FAILED', state: machine.state, reason: result.message ?? 'CLICK_REJECTED', balanceAfter: await this.client.getBalance() };
      }
      machine.transition('CONFIRM');
      const balanceAfter = await this.client.getBalance();
      const inventory = await this.client.getInventory();
      const balanceConfirmed = balanceAfter !== null && balanceAfter === balanceBefore - opportunity.listing.priceTotal;
      const inventoryConfirmed = inventory.entries.some((entry) => entry.item.itemType === opportunity.listing.item.itemType && entry.item.quantity >= opportunity.listing.item.quantity);
      machine.transition('VERIFY');
      if (balanceConfirmed && inventoryConfirmed) {
        machine.transition('SUCCESS');
        return { correlationId, outcome: 'CONFIRMED', state: machine.state, balanceAfter };
      }
      machine.transition('AMBIGUOUS');
      return { correlationId, outcome: 'UNKNOWN', state: machine.state, reason: 'RECONCILIATION_REQUIRED', balanceAfter };
    } finally {
      await this.locks.release(opportunity.listing.listingId, botId);
    }
  }
}
