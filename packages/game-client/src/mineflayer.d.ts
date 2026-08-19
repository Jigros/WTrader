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

  export interface MineflayerWindow {
    readonly id: number;
    readonly type: string;
    readonly title?: string | { toString(): string };
    readonly slots: readonly (MineflayerItem | null)[];
  }

  export interface Bot extends EventEmitter {
    readonly version?: string;
    readonly currentWindow: MineflayerWindow | null;
    readonly inventory: { readonly slots: readonly (MineflayerItem | null)[] };
    chat(message: string): void;
    quit(reason?: string): void;
    clickWindow(slot: number, mouseButton: number, mode: number): Promise<void>;
  }

  export interface BotOptions {
    readonly host: string;
    readonly port?: number;
    readonly username: string;
    readonly auth?: 'microsoft' | 'offline' | 'mojang';
    readonly version?: string;
    readonly profilesFolder?: string;
  }

  export function createBot(options: BotOptions): Bot;
}
