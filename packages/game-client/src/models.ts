import type { NormalizedItem, RawItem } from '@wtrader/shared-types';

export type GameClientState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'READY' | 'ERROR';
export type Unsubscribe = () => void;

export interface InventoryEntry {
  readonly slot: number;
  readonly item: RawItem;
}

export interface InventorySnapshot {
  readonly observedAt: Date;
  readonly entries: readonly InventoryEntry[];
}

export interface GuiSlot {
  readonly slot: number;
  readonly item: RawItem | null;
  readonly rawName?: string;
  readonly lore?: readonly string[];
  readonly quantity?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ClientGuiSnapshot {
  readonly id: string;
  readonly observedAt: Date;
  readonly title: string;
  readonly readableTitle?: string;
  readonly rawTitle?: string;
  readonly slotCount: number;
  readonly slots: readonly GuiSlot[];
  readonly cursor?: NormalizedItem | null;
  readonly signature: string;
}

export interface CommandResult {
  readonly accepted: boolean;
  readonly message?: string;
}

export interface ClickSlotRequest {
  readonly slot: number;
  readonly expectedSignature?: string;
  readonly expectedItemFingerprint?: string;
}

export interface ClickSlotResult {
  readonly accepted: boolean;
  readonly changed: boolean;
  readonly message?: string;
}

interface BaseClientEvent {
  readonly observedAt: Date;
}

export type GameClientEvent =
  | (BaseClientEvent & { readonly type: 'CLIENT_CONNECTED' })
  | (BaseClientEvent & { readonly type: 'CLIENT_DISCONNECTED'; readonly reason?: string })
  | (BaseClientEvent & { readonly type: 'CHAT_MESSAGE'; readonly message: string })
  | (BaseClientEvent & { readonly type: 'COMMAND_RESPONSE'; readonly result: CommandResult })
  | (BaseClientEvent & { readonly type: 'GUI_OPENED' | 'GUI_UPDATED'; readonly gui: ClientGuiSnapshot })
  | (BaseClientEvent & { readonly type: 'GUI_CLOSED'; readonly guiId: string })
  | (BaseClientEvent & { readonly type: 'INVENTORY_UPDATED'; readonly inventory: InventorySnapshot })
  | (BaseClientEvent & { readonly type: 'BALANCE_UPDATED'; readonly balance: number })
  | (BaseClientEvent & { readonly type: 'RAW_OBSERVATION'; readonly payload: unknown });
