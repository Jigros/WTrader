import { createHash } from 'node:crypto';
import { createBot, type Bot, type BotOptions, type MineflayerItem, type MineflayerWindow, type ProtocolClient, type ProtocolPacketMeta } from 'mineflayer';
import type { GameClientAdapter } from '../adapter.js';
import type { ClickSlotRequest, ClickSlotResult, ClientGuiSnapshot, CommandResult, GameClientEvent, GameClientState, InventorySnapshot, Unsubscribe } from '../models.js';

export interface PacketTraceEntry {
  readonly name: string;
  readonly direction: 'INBOUND' | 'OUTBOUND';
  readonly observedAt: string;
  readonly state: string;
}

const maximumPacketTraceEntries = 30;

export interface MineflayerConnectionOptions {
  readonly host: string;
  readonly port?: number;
  readonly username: string;
  readonly version?: string;
  readonly profilesFolder?: string;
  readonly reconnectDelayMs?: number;
  readonly resourcePackPolicy?: 'deny' | 'allow-remote-http';
  readonly exploitProtection?: boolean;
  readonly closeForcedSignEditor?: boolean;
  readonly earlyClientInformation?: boolean;
  readonly brand?: string;
  readonly locale?: string;
  readonly viewDistance?: number;
  readonly botFactory?: (options: BotOptions) => Bot;
}

export class MineflayerGameClientAdapter implements GameClientAdapter {
  private state: GameClientState = 'DISCONNECTED';
  private bot: Bot | null = null;
  private gui: ClientGuiSnapshot | null = null;
  private inventory: InventorySnapshot = { observedAt: new Date(0), entries: [] };
  private readonly handlers = new Set<(event: GameClientEvent) => void>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private disconnectRequested = false;
  private lastWindowFingerprint: string | null = null;
  private readonly packetTrace: PacketTraceEntry[] = [];

  constructor(private readonly options: MineflayerConnectionOptions) {}

  connect(): Promise<void> {
    if (this.state === 'CONNECTING' || this.state === 'CONNECTED' || this.state === 'READY') return Promise.resolve();
    this.disconnectRequested = false;
    this.state = 'CONNECTING';
    const factory = this.options.botFactory ?? createBot;
    this.bot = factory({ host: this.options.host, ...(this.options.port === undefined ? {} : { port: this.options.port }), username: this.options.username, auth: 'microsoft', ...(this.options.version === undefined ? {} : { version: this.options.version }), ...(this.options.profilesFolder === undefined ? {} : { profilesFolder: this.options.profilesFolder }), ...(this.options.brand === undefined ? {} : { brand: this.options.brand }), ...(this.options.viewDistance === undefined ? {} : { viewDistance: this.options.viewDistance }), ...(this.options.earlyClientInformation === true ? { clientSettings: { locale: this.options.locale ?? 'en_us', viewDistance: this.options.viewDistance ?? 10 } } : {}) });
    this.registerBot(this.bot);
    this.observeProtocol(this.bot._client);
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.disconnectRequested = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.bot?.quit('WTrader disconnect requested');
    this.bot = null;
    this.state = 'DISCONNECTED';
    return Promise.resolve();
  }

  getState(): Promise<GameClientState> { return Promise.resolve(this.state); }
  getBalance(): Promise<number | null> { return Promise.resolve(null); }
  getInventory(): Promise<InventorySnapshot> { return Promise.resolve(this.inventory); }
  getCurrentGui(): Promise<ClientGuiSnapshot | null> { return Promise.resolve(this.gui); }

  executeCommand(command: string): Promise<CommandResult> {
    if (this.bot === null || this.state !== 'READY') return Promise.resolve({ accepted: false, message: 'Mineflayer client is not ready' });
    this.bot.chat(command);
    return Promise.resolve({ accepted: true });
  }

  openAuctionHouse(): Promise<void> { return this.executeCommand('/ah').then((result) => { if (!result.accepted) throw new Error(result.message); }); }

  async clickSlot(request: ClickSlotRequest): Promise<ClickSlotResult> {
    const gui = this.gui;
    if (this.bot === null || gui === null) return { accepted: false, changed: false, message: 'No active window' };
    if (request.expectedSignature !== gui.signature) return { accepted: false, changed: false, message: 'GUI signature mismatch' };
    const slot = gui.slots.find((candidate) => candidate.slot === request.slot);
    if (slot === undefined || slot.item === null) return { accepted: false, changed: false, message: 'Expected slot is empty or missing' };
    if (request.expectedItemFingerprint !== undefined && rawItemFingerprint(slot.item) !== request.expectedItemFingerprint) return { accepted: false, changed: false, message: 'Item fingerprint mismatch' };
    await this.bot.clickWindow(request.slot, 0, 0);
    return { accepted: true, changed: false };
  }

  subscribe(handler: (event: GameClientEvent) => void): Unsubscribe { this.handlers.add(handler); return () => { this.handlers.delete(handler); }; }

  private registerBot(bot: Bot): void {
    bot.on('spawn', () => { this.state = 'READY'; this.emit({ type: 'CLIENT_CONNECTED', observedAt: new Date() }); this.observeInventory(bot); });
    bot.on('windowOpen', (window: MineflayerWindow | null) => {
      if (window === null) return;
      if (this.closeForcedWindow(bot, window)) return;
      if ('on' in window && typeof window.on === 'function') window.on('updateSlot', () => { this.observeWindow(window, 'GUI_UPDATED'); });
      this.observeWindow(window, 'GUI_OPENED');
    });
    bot.on('windowClose', (window: MineflayerWindow | null) => {
      if (window === null || this.gui?.id !== windowId(window)) return;
      const guiId = this.gui.id;
      this.gui = null;
      this.lastWindowFingerprint = null;
      this.emit({ type: 'GUI_CLOSED', observedAt: new Date(), guiId });
    });
    bot.on('windowUpdate', (window: MineflayerWindow | null) => { if (window !== null) this.observeWindow(window, 'GUI_UPDATED'); });
    bot.on('updateSlot', () => { if (bot.currentWindow !== null) this.observeWindow(bot.currentWindow, 'GUI_UPDATED'); else this.observeInventory(bot); });
    bot.on('resourcePack', (...args: unknown[]) => { this.handleResourcePack(bot, args); });
    bot.on('messagestr', (message: string) => { this.emit({ type: 'CHAT_MESSAGE', observedAt: new Date(), message }); });
    bot.on('kicked', (reason: unknown) => {
      const diagnostic = formatKickReason(reason);
      this.emit({ type: 'RAW_OBSERVATION', observedAt: new Date(), payload: { type: 'MINEFLAYER_KICKED', rawReason: diagnostic.rawReason, readableReason: diagnostic.readableReason, negotiatedClientVersion: bot.version ?? 'unknown', packetTrace: [...this.packetTrace] } });
    });
    bot.on('error', (error: Error) => { this.state = 'ERROR'; this.emit({ type: 'RAW_OBSERVATION', observedAt: new Date(), payload: { type: 'MINEFLAYER_ERROR', message: error.message } }); });
    bot.on('end', (reason: string) => { this.state = 'DISCONNECTED'; this.emit({ type: 'CLIENT_DISCONNECTED', observedAt: new Date(), reason }); this.scheduleReconnect(); });
  }

  private closeForcedWindow(bot: Bot, window: MineflayerWindow): boolean {
    if (this.options.exploitProtection === false) return false;
    const type = window.type.toLowerCase();
    const title = extractWindowTitle(window).trim().toLowerCase();
    const isSignEditor = type.includes('sign') || title.includes('sign');
    const isForcedEditor = type.includes('anvil') || title.includes('anvil') || title.includes('repair') || title.includes('smith');
    if (!isForcedEditor && !(this.options.closeForcedSignEditor === true && isSignEditor)) return false;
    const protectedBot = bot as Bot & { closeWindow?: (window: MineflayerWindow) => void };
    if (protectedBot.closeWindow === undefined) {
      this.emit({ type: 'RAW_OBSERVATION', observedAt: new Date(), payload: { type: 'MINEFLAYER_FORCED_WINDOW_CLOSE_UNAVAILABLE', windowType: type || 'unknown', title } });
      return true;
    }
    try {
      protectedBot.closeWindow(window);
      this.emit({ type: 'RAW_OBSERVATION', observedAt: new Date(), payload: { type: 'MINEFLAYER_FORCED_WINDOW_CLOSED', windowType: type || 'unknown', title } });
    } catch (error) {
      this.emit({ type: 'RAW_OBSERVATION', observedAt: new Date(), payload: { type: 'MINEFLAYER_FORCED_WINDOW_CLOSE_FAILED', message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }

  private handleResourcePack(bot: Bot, args: unknown[]): void {
    const url = args.find((value): value is string => typeof value === 'string');
    const policy = this.options.resourcePackPolicy ?? 'deny';
    const accepted = policy === 'allow-remote-http' && url !== undefined && isSafeResourcePackUrl(url);
    const resourcePackBot = bot as Bot & { acceptResourcePack: () => void; denyResourcePack: () => void };
    if (accepted) resourcePackBot.acceptResourcePack(); else resourcePackBot.denyResourcePack();
    this.emit({ type: 'RAW_OBSERVATION', observedAt: new Date(), payload: { type: 'MINEFLAYER_RESOURCE_PACK', accepted, ...(url === undefined ? {} : { url }), ...(accepted ? {} : { reason: policy === 'deny' ? 'Resource packs are disabled by policy' : 'Resource-pack URL is not a public HTTP(S) URL' }) } });
  }

  private observeProtocol(client: ProtocolClient | undefined): void {
    if (client === undefined) return;
    client.on('packet', (_data: unknown, metadata: ProtocolPacketMeta) => { this.recordPacket(metadata.name, 'INBOUND', metadata.state); });
    const write = client.write.bind(client);
    client.write = (name, parameters) => {
      this.recordPacket(name, 'OUTBOUND', client.state);
      write(name, parameters);
    };
  }

  private recordPacket(name: string, direction: PacketTraceEntry['direction'], state: string): void {
    this.packetTrace.push({ name, direction, observedAt: new Date().toISOString(), state });
    if (this.packetTrace.length > maximumPacketTraceEntries) this.packetTrace.shift();
  }

  private observeWindow(window: MineflayerWindow, eventType: 'GUI_OPENED' | 'GUI_UPDATED'): void {
    const gui = snapshotWindow(window);
    const fingerprint = gui.signature;
    if (eventType === 'GUI_UPDATED' && fingerprint === this.lastWindowFingerprint) return;
    this.gui = gui;
    this.lastWindowFingerprint = fingerprint;
    this.emit({ type: eventType, observedAt: gui.observedAt, gui });
  }

  private observeInventory(bot: Bot): void {
    const observedAt = new Date();
    const entries = bot.inventory.slots.flatMap((item, slot) => item === null ? [] : [{ slot, item: serializeItem(item) }]);
    this.inventory = { observedAt, entries };
    this.emit({ type: 'INVENTORY_UPDATED', observedAt, inventory: this.inventory });
  }

  private scheduleReconnect(): void {
    if (this.disconnectRequested || this.options.reconnectDelayMs === undefined || this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; void this.connect(); }, this.options.reconnectDelayMs);
  }

  private emit(event: GameClientEvent): void { for (const handler of this.handlers) handler(event); }
}

export function serializeItem(item: MineflayerItem) {
  return { itemType: `minecraft:${item.name}`, displayName: item.displayName ?? item.name, quantity: item.count, ...(item.durabilityUsed === undefined ? {} : { durability: item.durabilityUsed }), enchantments: (item.enchants ?? []).map((enchantment) => ({ id: enchantment.name, level: enchantment.lvl })), ...(item.lore === undefined ? {} : { lore: item.lore }), ...(item.nbt === undefined ? {} : { relevantNbt: { nbt: item.nbt } }) };
}

function snapshotWindow(window: MineflayerWindow): ClientGuiSnapshot {
  const observedAt = new Date();
  const slots = window.slots.map((item, slot) => ({ slot, item: item === null ? null : serializeItem(item), ...(item?.displayName === undefined ? {} : { rawName: item.displayName }), ...(item?.lore === undefined ? {} : { lore: item.lore }) }));
  const title = extractWindowTitle(window);
  const signature = createHash('sha256').update(JSON.stringify({ id: window.id, title, slots })).digest('hex');
  return { id: windowId(window), observedAt, title, slotCount: slots.length, slots, signature };
}

export function extractWindowTitle(window: MineflayerWindow): string {
  return typeof window.title === 'string' ? window.title : window.title?.toString() ?? window.type;
}

export function formatKickReason(reason: unknown): { readonly rawReason: string; readonly readableReason: string } {
  return { rawReason: safeJson(reason), readableReason: readableKickReason(reason) };
}

function safeJson(value: unknown): string {
  const seen = new WeakSet();
  try {
    const serialized = JSON.stringify(value, (_key, nested: unknown) => {
      if (typeof nested === 'bigint') return nested.toString();
      if (typeof nested === 'object' && nested !== null) {
        if (seen.has(nested)) return '[Circular]';
        seen.add(nested);
      }
      return nested;
    });
    return serialized;
  } catch {
    return '[Unserializable kick reason]';
  }
}

function readableKickReason(reason: unknown): string {
  if (typeof reason === 'string') return reason;
  if (typeof reason !== 'object' || reason === null) return String(reason);
  const component = reason as Record<string, unknown>;
  const text = component['text'];
  const translate = component['translate'];
  const extra = component['extra'];
  const pieces = [typeof text === 'string' ? text : '', typeof translate === 'string' ? translate : '', ...(Array.isArray(extra) ? extra.map(readableKickReason) : [])].filter((piece) => piece.length > 0);
  return pieces.length > 0 ? pieces.join(' ') : safeJson(reason);
}

export function isSafeResourcePackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !isPrivateHost(url.hostname);
  } catch {
    return false;
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0') return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4 === null) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [first, second] = octets as [number, number, number, number];
  return first === 10 || first === 127 || first === 0 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function windowId(window: MineflayerWindow): string { return `mineflayer:${window.id}:${window.type}`; }
export function itemFingerprint(item: ReturnType<typeof serializeItem>): string { return createHash('sha256').update(JSON.stringify(item)).digest('hex'); }
function rawItemFingerprint(item: ClientGuiSnapshot['slots'][number]['item']): string { return createHash('sha256').update(JSON.stringify(item)).digest('hex'); }
