import { createInterface } from 'node:readline';
import { loadEnvironment, loadTradingConfig, type TradingConfig } from '@wtrader/config';
import { Database } from '@wtrader/database';
import { InMemoryListingLock } from '@wtrader/execution';
import { MineflayerGameClientAdapter, type ClientGuiSnapshot, type GameClientEvent, type MineflayerConnectionOptions } from '@wtrader/game-client';
import { normalizeItem } from '@wtrader/market-model';
import type { AccountRiskState, Opportunity } from '@wtrader/shared-types';
import { listingFingerprint, opaqueListingFingerprint, parseDonutPrice } from '../../market-data/src/auction-parser.js';
import { donutGuiProfile, isDonutAuctionPage } from './donut-gui-profile.js';
import { LiveBuyTestMode } from './live-buy-test-mode.js';
import { SemanticPurchaseWorkflow } from './semantic-purchase-workflow.js';
import { guiSlotChanges } from './semantic-actions.js';

export interface SmokeTestEnvironment {
  readonly MINECRAFT_HOST?: string;
  readonly MINECRAFT_PORT?: string;
  readonly MINECRAFT_USERNAME?: string;
  readonly MINECRAFT_VERSION?: string;
  readonly MINECRAFT_PROFILES_FOLDER?: string;
  readonly MINECRAFT_EARLY_CLIENT_INFORMATION?: string;
  readonly MINECRAFT_BRAND?: string;
  readonly MINECRAFT_LOCALE?: string;
  readonly MINECRAFT_VIEW_DISTANCE?: string;
}

export function mineflayerOptionsFromEnvironment(environment: SmokeTestEnvironment): MineflayerConnectionOptions {
  const host = environment.MINECRAFT_HOST;
  const username = environment.MINECRAFT_USERNAME;
  if (host === undefined || host.length === 0) throw new Error('MINECRAFT_HOST is required');
  if (username === undefined || username.length === 0) throw new Error('MINECRAFT_USERNAME is required');
  const port = Number(environment.MINECRAFT_PORT ?? '25565');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('MINECRAFT_PORT must be a valid TCP port');
  const viewDistance = environment.MINECRAFT_VIEW_DISTANCE === undefined ? undefined : Number(environment.MINECRAFT_VIEW_DISTANCE);
  if (viewDistance !== undefined && (!Number.isInteger(viewDistance) || viewDistance < 2 || viewDistance > 32)) throw new Error('MINECRAFT_VIEW_DISTANCE must be an integer from 2 through 32');
  return {
    host,
    port,
    username,
    profilesFolder: environment.MINECRAFT_PROFILES_FOLDER ?? '.minecraft-auth',
    ...(environment.MINECRAFT_VERSION === undefined || environment.MINECRAFT_VERSION.length === 0 ? {} : { version: environment.MINECRAFT_VERSION }),
    ...(environment.MINECRAFT_EARLY_CLIENT_INFORMATION === 'true' ? { earlyClientInformation: true } : {}),
    ...(environment.MINECRAFT_BRAND === undefined || environment.MINECRAFT_BRAND.length === 0 ? {} : { brand: environment.MINECRAFT_BRAND }),
    ...(environment.MINECRAFT_LOCALE === undefined || environment.MINECRAFT_LOCALE.length === 0 ? {} : { locale: environment.MINECRAFT_LOCALE }),
    ...(viewDistance === undefined ? {} : { viewDistance }),
  };
}

export function formatSmokeEvent(event: GameClientEvent): string {
  switch (event.type) {
    case 'GUI_OPENED': return formatGui('[GUI_OPENED]', event.gui);
    case 'GUI_UPDATED': return `[GUI_UPDATED] title=${event.gui.title} id=${event.gui.id} slots=${event.gui.slotCount}`;
    case 'GUI_CLOSED': return `[GUI_CLOSED] id=${event.guiId}`;
    case 'INVENTORY_UPDATED': return `[INVENTORY_UPDATED] entries=${event.inventory.entries.length}`;
    case 'CHAT_MESSAGE': return `[CHAT] ${event.message}`;
    case 'CLIENT_CONNECTED': return '[CLIENT_CONNECTED]';
    case 'CLIENT_DISCONNECTED': return `[CLIENT_DISCONNECTED]${event.reason === undefined ? '' : ` reason=${event.reason}`}`;
    case 'BALANCE_UPDATED': return `[BALANCE_UPDATED] balance=${event.balance}`;
    case 'COMMAND_RESPONSE': return `[COMMAND_RESPONSE] accepted=${event.result.accepted}${event.result.message === undefined ? '' : ` message=${event.result.message}`}`;
    case 'RAW_OBSERVATION': return formatDiagnostic(event.payload);
  }
}

function formatDiagnostic(payload: unknown): string {
  if (!isKickDiagnostic(payload)) return `[DIAGNOSTIC] ${JSON.stringify(payload)}`;
  const inbound = payload.packetTrace.filter((entry) => entry.direction === 'INBOUND').map((entry) => `${entry.observedAt} ${entry.state} ${entry.name}`).join(', ');
  const outbound = payload.packetTrace.filter((entry) => entry.direction === 'OUTBOUND').map((entry) => `${entry.observedAt} ${entry.state} ${entry.name}`).join(', ');
  return `[MINEFLAYER_KICKED]\nreadableReason=${payload.readableReason}\nnegotiatedClientVersion=${payload.negotiatedClientVersion}\nserverPingVersion=unavailable\nlastInboundPackets=${inbound || 'none'}\nlastOutboundPackets=${outbound || 'none'}`;
}

function isUpdateSlotObservation(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null && (payload as Record<string, unknown>)['type'] === 'MINEFLAYER_UPDATE_SLOT';
}

function isKickDiagnostic(payload: unknown): payload is { readonly type: 'MINEFLAYER_KICKED'; readonly readableReason: string; readonly negotiatedClientVersion: string; readonly packetTrace: readonly { readonly name: string; readonly direction: 'INBOUND' | 'OUTBOUND'; readonly observedAt: string; readonly state: string }[] } {
  if (typeof payload !== 'object' || payload === null) return false;
  const value = payload as Record<string, unknown>;
  return value['type'] === 'MINEFLAYER_KICKED' && typeof value['readableReason'] === 'string' && typeof value['negotiatedClientVersion'] === 'string' && Array.isArray(value['packetTrace']);
}

export interface BuyTestCommand {
  execute(slot: number): Promise<{ readonly state: 'PURCHASED' | 'FAILED' | 'UNKNOWN'; readonly reason?: string }>;
}

export async function runSmokeCommand(adapter: MineflayerGameClientAdapter, line: string, confirmUnknownAction: (details: string) => Promise<boolean> = () => Promise.resolve(false), buyTest?: BuyTestCommand): Promise<string> {
  const [command, ...arguments_] = line.trim().split(/\s+/);
  switch (command) {
    case '/ah':
      await adapter.openAuctionHouse();
      return 'Auction House command sent';
    case '/cmd': {
      const minecraftCommand = arguments_.join(' ');
      if (minecraftCommand.length === 0) return 'Usage: /cmd <minecraft command>';
      const result = await adapter.executeCommand(minecraftCommand);
      return `Command accepted=${result.accepted}${result.message === undefined ? '' : ` message=${result.message}`}`;
    }
    case '/gui': return formatGuiSnapshot(await adapter.getCurrentGui());
    case '/slot': return formatSlot(await adapter.getCurrentGui(), arguments_[0]);
    case '/slotraw': return formatRawGuiSlot(adapter.getRawGuiSlot(parseSlotId(arguments_[0]) ?? -1), arguments_[0]);
    case '/windowraw': return formatRawGuiWindow(adapter.getRawGuiWindow());
    case '/click': return clickGuiSlot(adapter, arguments_[0], confirmUnknownAction);
    case '/buytest': {
      const slot = parseSlotId(arguments_[0]);
      if (slot === null || slot < 0 || slot > 44) return 'Usage: /buytest <slot 0..44>';
      if (buyTest === undefined) return 'Live buy test is not enabled';
      const result = await buyTest.execute(slot);
      return `buytest state=${result.state}${result.reason === undefined ? '' : ` reason=${result.reason}`}`;
    }
    case '/inventory': return formatInventory(await adapter.getInventory());
    case '/state': return `state=${await adapter.getState()}`;
    case '/quit': return 'QUIT';
    case '/help': return 'Commands: /ah, /cmd <minecraft command>, /gui, /slot <id>, /slotraw <id>, /windowraw, /click <slot>, /buytest <slot 0..44>, /inventory, /state, /quit';
    default: return 'Commands: /ah, /cmd <minecraft command>, /gui, /slot <id>, /slotraw <id>, /windowraw, /click <slot>, /buytest <slot 0..44>, /inventory, /state, /quit';
  }
}

async function clickGuiSlot(adapter: MineflayerGameClientAdapter, slotArgument: string | undefined, confirmUnknownAction: (details: string) => Promise<boolean>): Promise<string> {
  const gui = await adapter.getCurrentGui();
  if (gui === null) return 'No active GUI';
  const slot = parseSlotId(slotArgument);
  if (slot === null) return 'Usage: /click <slot>';
  const target = gui.slots.find((candidate) => candidate.slot === slot);
  if (target?.item === null || target === undefined) return `slot=${slot} is empty or missing`;
  const details = formatGuiSlot(target);
  if (!await confirmUnknownAction(`Confirm guarded click:\n${details}`)) return `Confirmation declined\n${details}`;
  const clickedAt = new Date();
  const result = await adapter.clickSlot({ slot, expectedSignature: gui.signature });
  return `clickTimestamp=${clickedAt.toISOString()}\n${details}\naccepted=${result.accepted} changed=${result.changed}${result.message === undefined ? '' : ` message=${result.message}`}`;
}

function parseSlotId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function buyTestOpportunity(gui: ClientGuiSnapshot, slot: number): Opportunity {
  if (!isDonutAuctionPage(gui)) throw new Error('BUYTEST_REQUIRES_DONUT_AUCTION_WINDOW');
  const entry = gui.slots.find((candidate) => candidate.slot === slot);
  if (entry?.item === null || entry === undefined || entry.item.lore === undefined) throw new Error('BUYTEST_LISTING_MISSING');
  const priceTotal = parseDonutPrice(entry.item.lore);
  if (priceTotal === null) throw new Error('BUYTEST_PRICE_UNREADABLE');
  const normalized = normalizeItem(entry.item);
  const listingId = listingFingerprint(normalized.marketId, { priceTotal }, 0, slot, entry.item.quantity);
  const fingerprint = opaqueListingFingerprint(entry.item);
  if (fingerprint === undefined) throw new Error('BUYTEST_LISTING_FINGERPRINT_MISSING');
  const listing = {
    listingId,
    item: entry.item,
    normalizedItemId: normalized.marketId,
    priceTotal,
    pricePerUnit: priceTotal / entry.item.quantity,
    firstSeenAt: gui.observedAt,
    lastSeenAt: gui.observedAt,
    auctionPage: 0,
    auctionSlot: slot,
    rawMetadata: { lore: entry.item.lore, sourceGuiId: gui.id },
    opaqueListingFingerprint: fingerprint,
  };
  return {
    opportunityId: listingId,
    listing,
    statistics: { marketId: normalized.marketId, observedAt: gui.observedAt, sampleSize: 1, weightedMedian: priceTotal, rollingMedian: priceTotal, ema: priceTotal, p10: priceTotal, p25: priceTotal, p75: priceTotal, minimumPrice: priceTotal, listingCount: 1, visibleSupply: 1, volatility: 0, liquidityScore: 1, estimatedSaleTimeMs: 0, fairValue: priceTotal, confidence: 'HIGH', stale: false },
    expectedSellPrice: priceTotal,
    expectedProfit: 0,
    roi: 0,
    expectedHoldingTimeMs: 0,
    profitPerCapitalHour: 0,
    score: 0,
    confidence: 'HIGH',
    detectedAt: gui.observedAt,
  };
}

function createBuyTestCommand(adapter: MineflayerGameClientAdapter, config: TradingConfig, database: Database, botId: string): BuyTestCommand {
  const test = config.execution.liveBuyTest;
  if (test === undefined) throw new Error('LIVE_BUY_TEST_NOT_EXPLICITLY_ENABLED');
  const mode = new LiveBuyTestMode(new SemanticPurchaseWorkflow(adapter, new InMemoryListingLock(), config), database, config);
  return {
    async execute(slot: number) {
      const gui = await adapter.getCurrentGui();
      if (gui === null) throw new Error('BUYTEST_REQUIRES_ACTIVE_GUI');
      const opportunity = buyTestOpportunity(gui, slot);
      const balance = await adapter.getBalance();
      const accountId = await database.accountIdForExternalIdentity(botId);
      if (accountId === null) throw new Error('BUYTEST_ACCOUNT_NOT_ENABLED');
      const riskState: AccountRiskState = { accountId, availableCapital: balance ?? 0, dailyRealizedPnl: 0, consecutiveExecutionFailures: 0, positions: [], tradingPaused: false };
      const result = await mode.execute(opportunity, riskState, botId, { profile: donutGuiProfile });
      return { state: result.state === 'PURCHASED' ? 'PURCHASED' : result.state === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED', ...(result.reason === undefined ? {} : { reason: result.reason }) };
    },
  };
}

export function formatSlot(gui: ClientGuiSnapshot | null, slotArgument: string | undefined): string {
  if (gui === null) return 'No active GUI';
  const slot = parseSlotId(slotArgument);
  if (slot === null) return 'Usage: /slot <id>';
  const target = gui.slots.find((candidate) => candidate.slot === slot);
  return target === undefined ? `slot=${slot} is missing` : JSON.stringify(safeSlotDebugData(target), null, 2);
}

export function formatRawGuiSlot(item: unknown, slotArgument: string | undefined): string {
  const slot = parseSlotId(slotArgument);
  if (slot === null) return 'Usage: /slotraw <id>';
  return item === null ? `slot=${slot} is empty or no active GUI` : JSON.stringify(allowlistedRawItem(item), null, 2);
}

export function formatRawGuiWindow(window: unknown): string {
  if (window === null) return 'No active GUI';
  const source = window as Record<string, unknown>;
  const slots = Array.isArray(source['slots']) ? source['slots'] : [];
  return JSON.stringify({
    window: allowlistedObject(source, ['id', 'type', 'title', 'inventoryStart', 'inventoryEnd', 'firstEmptyContainerSlot', 'requiresConfirmation']),
    nonEmptySlotRawKeys: slots.flatMap((item, slot) => item === null || typeof item !== 'object' ? [] : [{ slot, keys: Object.keys(item as Record<string, unknown>).slice(0, 32) }]),
  }, null, 2);
}

function allowlistedRawItem(item: unknown): unknown {
  if (typeof item !== 'object' || item === null) return item;
  return allowlistedObject(item as Record<string, unknown>, ['name', 'type', 'count', 'metadata', 'displayName', 'customName', 'lore', 'nbt', 'components', 'rawData', 'rawNbt']);
}

function allowlistedObject(source: Record<string, unknown>, keys: readonly string[]): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of keys) if (source[key] !== undefined) result[key] = boundedDebugValue(source[key]);
  result['componentKeys'] = Object.keys(source).filter((key) => /component|name|lore|nbt|data|json|text/i.test(key)).slice(0, 32);
  return result;
}

function safeSlotDebugData(slot: ClientGuiSnapshot['slots'][number]): unknown {
  return slot.item === null ? slot : { ...slot, item: { ...slot.item, customMetadata: boundedDebugValue(slot.item.customMetadata) } };
}

function boundedDebugValue(value: unknown, depth = 0): unknown {
  if (depth >= 6) return '[truncated]';
  if (typeof value === 'string') return value.slice(0, 1024);
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 32).map((entry) => boundedDebugValue(entry, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 32).map(([key, entry]) => [key, boundedDebugValue(entry, depth + 1)]));
}

function formatGui(prefix: string, gui: NonNullable<Awaited<ReturnType<MineflayerGameClientAdapter['getCurrentGui']>>>): string {
  return `${prefix}\ntitle=${gui.title}\nrawTitle=${gui.rawTitle ?? gui.title}\nid=${gui.id}\nslots=${gui.slotCount}\n${formatGuiSlots(gui)}`;
}

export function formatGuiSnapshot(gui: Awaited<ReturnType<MineflayerGameClientAdapter['getCurrentGui']>>): string {
  return gui === null ? 'No active GUI' : formatGui('[GUI]', gui);
}

function formatGuiSlots(gui: NonNullable<Awaited<ReturnType<MineflayerGameClientAdapter['getCurrentGui']>>>): string {
  return gui.slots.flatMap((slot) => slot.item === null ? [] : [formatGuiSlot(slot)]).join('\n');
}

function formatGuiSlot(slot: NonNullable<ClientGuiSnapshot['slots'][number]>): string {
  if (slot.item === null) return `slot=${slot.slot} empty`;
  return `slot=${slot.slot} item=${slot.item.itemType} name=${slot.item.displayName} quantity=${slot.item.quantity}${slot.item.lore === undefined ? '' : ` lore=${slot.item.lore.join(' | ')}`}`;
}

export function formatInventory(inventory: Awaited<ReturnType<MineflayerGameClientAdapter['getInventory']>>): string {
  if (inventory.entries.length === 0) return 'Inventory is empty';
  return inventory.entries.map((entry) => `slot=${entry.slot} item=${entry.item.itemType} name=${entry.item.displayName} quantity=${entry.item.quantity}${entry.item.lore === undefined ? '' : ` lore=${entry.item.lore.join(' | ')}`}`).join('\n');
}

export async function startMineflayerSmokeTest(environment: SmokeTestEnvironment = process.env): Promise<void> {
  const options = mineflayerOptionsFromEnvironment(environment);
  const adapter = new MineflayerGameClientAdapter(options);
  const config = await loadTradingConfig();
  const database = new Database(loadEnvironment().DATABASE_URL);
  const buyTest = config.execution.liveBuyTest === undefined ? undefined : createBuyTestCommand(adapter, config, database, options.username);
  let shuttingDown = false;
  process.stdout.write(`Mineflayer smoke test host=${options.host} port=${options.port ?? 25565} username=${options.username} version=${options.version ?? 'auto'} profilesFolder=${options.profilesFolder ?? '.minecraft-auth'} auth=microsoft\n`);
  let refreshClickAt: Date | null = null;
  let firstUpdateSlotAt: Date | null = null;
  let rawUpdateSlotEvents = 0;
  let normalizedGuiEvents = 0;
  let previousGui: ClientGuiSnapshot | null = null;
  adapter.subscribe((event) => {
    if (event.type === 'RAW_OBSERVATION' && isUpdateSlotObservation(event.payload)) {
      rawUpdateSlotEvents += 1;
      if (refreshClickAt !== null && firstUpdateSlotAt === null) firstUpdateSlotAt = event.observedAt;
    }
    if ((event.type === 'GUI_OPENED' || event.type === 'GUI_UPDATED') && refreshClickAt !== null) {
      normalizedGuiEvents += 1;
      const changedSlots = guiSlotChanges(previousGui, event.gui).filter((change) => change.slot >= 0 && change.slot <= 44).map((change) => change.slot);
      const latencyMs = firstUpdateSlotAt === null ? 'unavailable' : firstUpdateSlotAt.getTime() - refreshClickAt.getTime();
      process.stdout.write(`[REFRESH_DEBUG] clickTimestamp=${refreshClickAt.toISOString()} firstUpdateSlotTimestamp=${firstUpdateSlotAt?.toISOString() ?? 'unavailable'} changedSlotIds=${changedSlots.join(',')} duplicateRawEventCount=${Math.max(0, rawUpdateSlotEvents - normalizedGuiEvents)} normalizedEventCount=${normalizedGuiEvents} clickToFirstDeltaLatencyMs=${latencyMs}\n`);
      refreshClickAt = null;
    }
    if (event.type === 'GUI_OPENED' || event.type === 'GUI_UPDATED') previousGui = event.gui;
    process.stdout.write(`${formatSmokeEvent(event)}\n`);
  });
  await adapter.connect();
  const readline = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  readline.setPrompt('wtrader> ');
  readline.prompt();
  async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    readline.close();
    await adapter.disconnect();
    await database.close();
    process.stdout.write(`Mineflayer smoke test stopped: ${reason}\n`);
  }
  readline.on('line', (line) => {
    void runSmokeCommand(adapter, line, async (details) => new Promise((resolve) => {
      process.stdout.write(`${details}\nType yes to confirm: `);
      readline.once('line', (answer) => { resolve(answer.trim().toLowerCase() === 'yes'); });
    }), buyTest).then(async (output) => {
      if (output === 'QUIT') await shutdown('command');
      else if (output.startsWith('buytest state=FAILED') || output.startsWith('buytest state=UNKNOWN')) {
        process.stdout.write(`${output}\n`);
        await shutdown('buytest-terminal-state');
      } else { process.stdout.write(`${output}\n`); readline.prompt(); }
    }).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); readline.prompt(); });
  });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}

if (process.argv[1]?.endsWith('mineflayer-main.ts') === true) await startMineflayerSmokeTest();
