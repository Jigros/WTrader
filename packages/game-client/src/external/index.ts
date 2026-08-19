import type { InboundProtocolMessage, OutboundProtocolMessage } from '@wtrader/protocol';
import { parseInboundMessage } from '@wtrader/protocol';
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

export interface ExternalTransport {
  connect(handler: (message: unknown) => void): Promise<void>;
  disconnect(): Promise<void>;
  send(message: OutboundProtocolMessage): Promise<unknown>;
}

export class ExternalGameClientAdapter implements GameClientAdapter {
  private state: GameClientState = 'DISCONNECTED';
  private balance: number | null = null;
  private inventory: InventorySnapshot = { observedAt: new Date(0), entries: [] };
  private gui: ClientGuiSnapshot | null = null;
  private sequence = -1;
  private readonly handlers = new Set<(event: GameClientEvent) => void>();

  constructor(private readonly transport: ExternalTransport) {}

  async connect(): Promise<void> {
    this.state = 'CONNECTING';
    await this.transport.connect((input) => { this.receive(input); });
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.state = 'DISCONNECTED';
  }

  getState(): Promise<GameClientState> {
    return Promise.resolve(this.state);
  }

  getBalance(): Promise<number | null> {
    return Promise.resolve(this.balance);
  }

  getInventory(): Promise<InventorySnapshot> {
    return Promise.resolve(this.inventory);
  }

  executeCommand(command: string): Promise<CommandResult> {
    void command;
    return Promise.reject(new Error('External game client is observe-only; outbound game actions are disabled'));
  }

  openAuctionHouse(): Promise<void> {
    return Promise.reject(new Error('External game client is observe-only; outbound game actions are disabled'));
  }

  getCurrentGui(): Promise<ClientGuiSnapshot | null> {
    return Promise.resolve(this.gui);
  }

  clickSlot(request: ClickSlotRequest): Promise<ClickSlotResult> {
    void request;
    return Promise.reject(new Error('External game client is observe-only; outbound game actions are disabled'));
  }

  subscribe(handler: (event: GameClientEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private receive(input: unknown): void {
    const message = parseInboundMessage(input);
    if (message.sequence <= this.sequence) return;
    this.sequence = message.sequence;
    const event = this.toEvent(message);
    if (event === null) return;
    for (const handler of this.handlers) handler(event);
  }

  private toEvent(message: InboundProtocolMessage): GameClientEvent | null {
    const observedAt = new Date(message.timestamp);
    switch (message.type) {
      case 'client.connected':
        this.state = 'READY';
        return { type: 'CLIENT_CONNECTED', observedAt };
      case 'client.disconnected':
        this.state = 'DISCONNECTED';
        return { type: 'CLIENT_DISCONNECTED', observedAt, ...(message.payload.reason === undefined ? {} : { reason: message.payload.reason }) };
      case 'gui.opened': {
        const gui = message.payload as unknown as ClientGuiSnapshot;
        this.gui = gui;
        return { type: 'GUI_OPENED', observedAt, gui };
      }
      case 'gui.snapshot': {
        const gui = message.payload as unknown as ClientGuiSnapshot;
        this.gui = gui;
        return { type: 'GUI_UPDATED', observedAt, gui };
      }
      case 'gui.slot_delta': {
        if (this.gui === null || this.gui.id !== message.payload.guiId) return null;
        const slots = this.gui.slots.filter((slot) => slot.slot !== message.payload.slot.slot);
        slots.push(message.payload.slot as unknown as ClientGuiSnapshot['slots'][number]);
        const gui: ClientGuiSnapshot = {
          ...this.gui,
          slots,
          signature: message.payload.signature ?? this.gui.signature,
          observedAt,
        };
        this.gui = gui;
        return { type: 'GUI_UPDATED', observedAt, gui };
      }
      case 'balance.updated':
        this.balance = message.payload.balance;
        return { type: 'BALANCE_UPDATED', observedAt, balance: message.payload.balance };
      case 'inventory.snapshot':
      case 'inventory.updated': {
        const inventory = {
          observedAt: message.payload.observedAt ?? observedAt,
          entries: message.payload.entries,
        } as InventorySnapshot;
        this.inventory = inventory;
        return { type: 'INVENTORY_UPDATED', observedAt, inventory };
      }
      case 'inventory.delta': {
        const entries = this.inventory.entries.filter((entry) => entry.slot !== message.payload.slot);
        if (message.payload.item !== null) entries.push({ slot: message.payload.slot, item: message.payload.item as unknown as InventorySnapshot['entries'][number]['item'] });
        const inventory: InventorySnapshot = { observedAt, entries };
        this.inventory = inventory;
        return { type: 'INVENTORY_UPDATED', observedAt, inventory };
      }
      case 'chat.message':
        return { type: 'CHAT_MESSAGE', observedAt, message: message.payload.message };
      case 'gui.closed':
      case 'screen.closed':
        this.gui = null;
        return { type: 'GUI_CLOSED', observedAt, guiId: message.payload.guiId };
      case 'manual.click':
      case 'manual.slot_click':
        return { type: 'RAW_OBSERVATION', observedAt, payload: { type: message.type, ...message.payload } };
    }
  }
}
