import type { TradingConfig } from '@wtrader/config';
import type { PurchaseAttemptOutcome } from '@wtrader/database';
import type { AccountRiskState, Opportunity } from '@wtrader/shared-types';
import type { SemanticPurchaseResult, SemanticPurchaseLayout } from './semantic-purchase-workflow.js';
import { SemanticPurchaseWorkflow } from './semantic-purchase-workflow.js';

export interface PurchaseAttemptStore {
  savePurchaseAttempt(outcome: PurchaseAttemptOutcome): Promise<void>;
}

export class LiveBuyTestMode {
  private executed = false;
  private financialActionsStopped = false;

  constructor(
    private readonly workflow: SemanticPurchaseWorkflow,
    private readonly store: PurchaseAttemptStore,
    private readonly config: TradingConfig,
  ) {}

  async execute(opportunity: Opportunity, riskState: AccountRiskState, botId: string, layout: SemanticPurchaseLayout = {}): Promise<SemanticPurchaseResult> {
    if (this.financialActionsStopped) throw new Error('FINANCIAL_ACTIONS_STOPPED');
    if (this.executed) throw new Error('LIVE_BUY_TEST_ALREADY_EXECUTED');
    const test = this.config.execution.liveBuyTest;
    if (this.config.execution.safetyMode !== 'LIVE' || test === undefined) throw new Error('LIVE_BUY_TEST_NOT_EXPLICITLY_ENABLED');
    if (opportunity.listing.priceTotal > test.maxPrice) throw new Error('LIVE_BUY_TEST_PRICE_LIMIT_EXCEEDED');

    this.executed = true;
    const startedAt = new Date();
    const result = await this.workflow.purchase(opportunity, riskState, botId, layout);
    if (result.state === 'UNKNOWN' || result.state === 'FAILED') this.financialActionsStopped = true;
    await this.store.savePurchaseAttempt({
      opportunityId: opportunity.opportunityId,
      accountId: riskState.accountId,
      correlationId: result.correlationId,
      status: result.state === 'PURCHASED' ? 'SUCCEEDED' : result.state === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED',
      ...(result.reason === undefined ? {} : { reason: result.reason }),
      evidence: {
        semanticState: result.state,
        ...(result.evidence === undefined ? {} : { verification: result.evidence }),
      },
      startedAt,
      completedAt: new Date(),
    });
    return result;
  }
}
