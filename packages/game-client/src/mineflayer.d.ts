declare module 'mineflayer' {
  import { EventEmitter } from 'node:events';

  export interface MineflayerItem {
    readonly type: number;
    readonly name: string;
    readonly displayName?: string;
    readonly count: number;
    readonly durabilityUsed?: number;
    readonly nbt?: unknown;
    readonly lore?: readonly string[];
    readonly enchants?: readonly { readonly name: string; readonly lvl: number }[];
  }

  export interface MineflayerWindow extends EventEmitter {
    readonly id: number;
    readonly type: string;
    readonly title?: string | { toString(): string };
    readonly slots: readonly (MineflayerItem | null)[];
  }

  export interface ProtocolPacketMeta { readonly name: string; readonly state: string; }
  export interface ProtocolClient extends EventEmitter {
    readonly state: string;
    write(name: string, parameters: unknown): void;
  }

  export interface Bot extends EventEmitter {
    readonly version?: string;
    readonly _client?: ProtocolClient;
    readonly currentWindow: MineflayerWindow | null;
    readonly inventory: { readonly slots: readonly (MineflayerItem | null)[] };
    chat(message: string): void;
    quit(reason?: string): void;
    clickWindow(slot: number, mouseButton: number, mode: number): Promise<void>;
  }

  export interface ClientSettings {
    readonly locale?: string;
    readonly viewDistance?: number;
  }

  export interface BotOptions {
    readonly host: string;
    readonly port?: number;
    readonly username: string;
    readonly auth?: 'microsoft' | 'offline' | 'mojang';
    readonly version?: string;
    readonly profilesFolder?: string;
    readonly brand?: string;
    readonly viewDistance?: number;
    readonly clientSettings?: ClientSettings;
  }

  export function createBot(options: BotOptions): Bot;
}
