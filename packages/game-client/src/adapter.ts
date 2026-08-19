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

export interface GameClientAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getState(): Promise<GameClientState>;
  getBalance(): Promise<number | null>;
  getInventory(): Promise<InventorySnapshot>;
  executeCommand(command: string): Promise<CommandResult>;
  openAuctionHouse(): Promise<void>;
  getCurrentGui(): Promise<ClientGuiSnapshot | null>;
  clickSlot(request: ClickSlotRequest): Promise<ClickSlotResult>;
  subscribe(handler: (event: GameClientEvent) => void): Unsubscribe;
}
