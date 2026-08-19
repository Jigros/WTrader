import type { AllowedGameAction } from '@wtrader/shared-types';
import type { GameClientAdapter } from './adapter.js';
import type {
  ClickSlotRequest,
  ClickSlotResult,
  ClientGuiSnapshot,
  CommandResult,
  GameClientEvent,
  GameClientState,
  InventorySnapshot,
  Unsubscribe,
} from './models.js';

export type { GameClientAdapter } from './adapter.js';
export type * from './models.js';
export { ExternalGameClientAdapter, type ExternalTransport } from './external/index.js';
export { MockGameClientAdapter, structuralGuiSignature, type MockPurchase } from './mock/index.js';
export { extractWindowTitle, formatKickReason, MineflayerGameClientAdapter, itemFingerprint, serializeItem, type MineflayerConnectionOptions } from './mineflayer/index.js';
export { ReplayGameClientAdapter } from './replay/index.js';

export interface ActionPolicyOptions {
  readonly allowedCommands: readonly string[];
  readonly maximumWaitMs?: number;
  readonly validSlotRange?: readonly [number, number];
}

export class ActionPolicy {
  private readonly maximumWaitMs: number;
  private readonly validSlotRange: readonly [number, number];

  constructor(private readonly options: ActionPolicyOptions) {
    this.maximumWaitMs = options.maximumWaitMs ?? 30_000;
    this.validSlotRange = options.validSlotRange ?? [0, 89];
  }

  authorize(action: AllowedGameAction): boolean {
    switch (action.type) {
      case 'RUN_COMMAND': return this.options.allowedCommands.includes(action.command);
      case 'CLICK_SLOT': return Number.isInteger(action.slot) && action.slot >= this.validSlotRange[0] && action.slot <= this.validSlotRange[1];
      case 'WAIT': return Number.isInteger(action.milliseconds) && action.milliseconds >= 0 && action.milliseconds <= this.maximumWaitMs;
      case 'OPEN_AH':
      case 'NEXT_PAGE':
      case 'PREVIOUS_PAGE':
      case 'REFRESH': return true;
    }
  }
}

export class PolicyEnforcedGameClient implements GameClientAdapter {
  constructor(private readonly client: GameClientAdapter, private readonly policy: ActionPolicy) {}

  connect(): Promise<void> { return this.client.connect(); }
  disconnect(): Promise<void> { return this.client.disconnect(); }
  getState(): Promise<GameClientState> { return this.client.getState(); }
  getBalance(): Promise<number | null> { return this.client.getBalance(); }
  getInventory(): Promise<InventorySnapshot> { return this.client.getInventory(); }
  getCurrentGui(): Promise<ClientGuiSnapshot | null> { return this.client.getCurrentGui(); }
  subscribe(handler: (event: GameClientEvent) => void): Unsubscribe { return this.client.subscribe(handler); }

  executeCommand(command: string): Promise<CommandResult> {
    if (!this.policy.authorize({ type: 'RUN_COMMAND', command })) return Promise.reject(new Error('Game command rejected by policy'));
    return this.client.executeCommand(command);
  }

  openAuctionHouse(): Promise<void> {
    if (!this.policy.authorize({ type: 'OPEN_AH' })) return Promise.reject(new Error('Auction action rejected by policy'));
    return this.client.openAuctionHouse();
  }

  clickSlot(request: ClickSlotRequest): Promise<ClickSlotResult> {
    if (!this.policy.authorize({ type: 'CLICK_SLOT', slot: request.slot })) return Promise.reject(new Error('Game click rejected by policy'));
    return this.client.clickSlot(request);
  }
}
