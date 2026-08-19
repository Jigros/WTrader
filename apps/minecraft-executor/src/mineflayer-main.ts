import { createInterface } from 'node:readline';
import { MineflayerGameClientAdapter, type GameClientEvent, type MineflayerConnectionOptions } from '@wtrader/game-client';

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

function isKickDiagnostic(payload: unknown): payload is { readonly type: 'MINEFLAYER_KICKED'; readonly readableReason: string; readonly negotiatedClientVersion: string; readonly packetTrace: readonly { readonly name: string; readonly direction: 'INBOUND' | 'OUTBOUND'; readonly observedAt: string; readonly state: string }[] } {
  if (typeof payload !== 'object' || payload === null) return false;
  const value = payload as Record<string, unknown>;
  return value['type'] === 'MINEFLAYER_KICKED' && typeof value['readableReason'] === 'string' && typeof value['negotiatedClientVersion'] === 'string' && Array.isArray(value['packetTrace']);
}

export async function runSmokeCommand(adapter: MineflayerGameClientAdapter, line: string): Promise<string> {
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
    case '/inventory': return formatInventory(await adapter.getInventory());
    case '/state': return `state=${await adapter.getState()}`;
    case '/quit': return 'QUIT';
    default: return 'Commands: /ah, /cmd <minecraft command>, /gui, /inventory, /state, /quit';
  }
}

function formatGui(prefix: string, gui: NonNullable<Awaited<ReturnType<MineflayerGameClientAdapter['getCurrentGui']>>>): string {
  return `${prefix}\ntitle=${gui.title}\nid=${gui.id}\nslots=${gui.slotCount}\n${formatGuiSlots(gui)}`;
}

export function formatGuiSnapshot(gui: Awaited<ReturnType<MineflayerGameClientAdapter['getCurrentGui']>>): string {
  return gui === null ? 'No active GUI' : formatGui('[GUI]', gui);
}

function formatGuiSlots(gui: NonNullable<Awaited<ReturnType<MineflayerGameClientAdapter['getCurrentGui']>>>): string {
  return gui.slots.flatMap((slot) => slot.item === null ? [] : [`slot=${slot.slot} item=${slot.item.itemType} name=${slot.item.displayName} quantity=${slot.item.quantity}${slot.item.lore === undefined ? '' : ` lore=${slot.item.lore.join(' | ')}`}`]).join('\n');
}

export function formatInventory(inventory: Awaited<ReturnType<MineflayerGameClientAdapter['getInventory']>>): string {
  if (inventory.entries.length === 0) return 'Inventory is empty';
  return inventory.entries.map((entry) => `slot=${entry.slot} item=${entry.item.itemType} name=${entry.item.displayName} quantity=${entry.item.quantity}${entry.item.lore === undefined ? '' : ` lore=${entry.item.lore.join(' | ')}`}`).join('\n');
}

export async function startMineflayerSmokeTest(environment: SmokeTestEnvironment = process.env): Promise<void> {
  const options = mineflayerOptionsFromEnvironment(environment);
  const adapter = new MineflayerGameClientAdapter(options);
  let shuttingDown = false;
  process.stdout.write(`Mineflayer smoke test host=${options.host} port=${options.port ?? 25565} username=${options.username} version=${options.version ?? 'auto'} profilesFolder=${options.profilesFolder ?? '.minecraft-auth'} auth=microsoft\n`);
  adapter.subscribe((event) => { process.stdout.write(`${formatSmokeEvent(event)}\n`); });
  await adapter.connect();
  const readline = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  readline.setPrompt('wtrader> ');
  readline.prompt();
  async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    readline.close();
    await adapter.disconnect();
    process.stdout.write(`Mineflayer smoke test stopped: ${reason}\n`);
  }
  readline.on('line', (line) => {
    void runSmokeCommand(adapter, line).then(async (output) => {
      if (output === 'QUIT') await shutdown('command');
      else { process.stdout.write(`${output}\n`); readline.prompt(); }
    }).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); readline.prompt(); });
  });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}

if (process.argv[1]?.endsWith('mineflayer-main.ts') === true) await startMineflayerSmokeTest();
