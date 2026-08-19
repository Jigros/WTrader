import { randomUUID } from 'node:crypto';
import type { GameClientAdapter } from '../adapter.js';
import type {
  ClickSlotRequest,
  ClickSlotResult,
  ClientGuiSnapshot,
  CommandResult,
  GameClientEvent,
  GameClientState,
  InventorySnapshot,
  Unsubscribe,
} from '../models.js';

export interface MockPurchase {
  readonly guiSlot: number;
  readonly inventoryItem: InventorySnapshot['entries'][number]['item'];
  readonly price: number;
}

export class MockGameClientAdapter implements GameClientAdapter {
  private state: GameClientState = 'DISCONNECTED';
  private balance: number;
  private inventory: InventorySnapshot;
  private gui: ClientGuiSnapshot | null = null;
  private readonly handlers = new Set<(event: GameClientEvent) => void>();
  private readonly purchases = new Map<number, MockPurchase>();

  constructor(initialBalance: number, initialInventory: InventorySnapshot = { observedAt: new Date(0), entries: [] }) {
    this.balance = initialBalance;
    this.inventory = initialInventory;
  }

  connect(): Promise<void> {
    this.state = 'READY';
    this.emit({ type: 'CLIENT_CONNECTED', observedAt: new Date() });
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.state = 'DISCONNECTED';
    this.emit({ type: 'CLIENT_DISCONNECTED', observedAt: new Date(), reason: 'requested' });
    return Promise.resolve();
  }

  getState(): Promise<GameClientState> {
    return Promise.resolve(this.state);
  }

  getBalance(): Promise<number> {
    return Promise.resolve(this.balance);
  }

  getInventory(): Promise<InventorySnapshot> {
    return Promise.resolve(this.inventory);
  }

  executeCommand(command: string): Promise<CommandResult> {
    const accepted = command === '/ah';
    const result = accepted ? { accepted: true } : { accepted: false, message: 'Command not configured' };
    this.emit({ type: 'COMMAND_RESPONSE', observedAt: new Date(), result });
    return Promise.resolve(result);
  }

  openAuctionHouse(): Promise<void> {
    if (this.gui !== null) this.emit({ type: 'GUI_OPENED', observedAt: new Date(), gui: this.gui });
    return Promise.resolve();
  }

  getCurrentGui(): Promise<ClientGuiSnapshot | null> {
    return Promise.resolve(this.gui);
  }

  clickSlot(request: ClickSlotRequest): Promise<ClickSlotResult> {
    if (this.gui === null || request.expectedSignature !== undefined && request.expectedSignature !== this.gui.signature) {
      return Promise.resolve({ accepted: false, changed: false, message: 'GUI signature changed' });
    }
    const purchase = this.purchases.get(request.slot);
    if (purchase === undefined || purchase.price > this.balance) {
      return Promise.resolve({ accepted: false, changed: false, message: 'Listing unavailable' });
    }
    this.balance -= purchase.price;
    this.inventory = {
      observedAt: new Date(),
      entries: [...this.inventory.entries, { slot: this.nextInventorySlot(), item: purchase.inventoryItem }],
    };
    this.purchases.delete(request.slot);
    this.emit({ type: 'BALANCE_UPDATED', observedAt: new Date(), balance: this.balance });
    this.emit({ type: 'INVENTORY_UPDATED', observedAt: new Date(), inventory: this.inventory });
    this.emit({ type: 'CHAT_MESSAGE', observedAt: new Date(), message: 'Purchase successful' });
    return Promise.resolve({ accepted: true, changed: true });
  }

  subscribe(handler: (event: GameClientEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  setGui(gui: ClientGuiSnapshot): void {
    const opened = this.gui === null;
    this.gui = gui;
    this.emit({ type: opened ? 'GUI_OPENED' : 'GUI_UPDATED', observedAt: gui.observedAt, gui });
  }

  registerPurchase(purchase: MockPurchase): void {
    this.purchases.set(purchase.guiSlot, purchase);
  }

  simulateSale(inventorySlot: number, revenue: number): void {
    this.inventory = {
      observedAt: new Date(),
      entries: this.inventory.entries.filter((entry) => entry.slot !== inventorySlot),
    };
    this.balance += revenue;
    this.emit({ type: 'INVENTORY_UPDATED', observedAt: new Date(), inventory: this.inventory });
    this.emit({ type: 'BALANCE_UPDATED', observedAt: new Date(), balance: this.balance });
    this.emit({ type: 'CHAT_MESSAGE', observedAt: new Date(), message: `Auction sold for ${revenue}` });
  }

  static gui(title: string, slots: ClientGuiSnapshot['slots'], observedAt = new Date()): ClientGuiSnapshot {
    return { id: randomUUID(), observedAt, title, slotCount: slots.length, slots, signature: structuralGuiSignature(title, slots) };
  }

  private nextInventorySlot(): number {
    return Math.max(-1, ...this.inventory.entries.map((entry) => entry.slot)) + 1;
  }

  private emit(event: GameClientEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

export function structuralGuiSignature(title: string, slots: ClientGuiSnapshot['slots']): string {
  const stableSlots = slots.map((slot) => ({ slot: slot.slot, occupied: slot.item !== null, control: slot.metadata?.['control'] ?? null }));
  return `${title.toLowerCase().trim()}:${JSON.stringify(stableSlots)}`;
}
