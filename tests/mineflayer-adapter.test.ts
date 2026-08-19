import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { formatKickReason, isSafeResourcePackUrl, MineflayerGameClientAdapter, itemFingerprint, serializeItem } from '@wtrader/game-client';
import type { Bot } from 'mineflayer';

class BotFixture extends EventEmitter {
  version = '1.21.1';
  currentWindow: { id: number; type: string; title: string; slots: ({ type: number; name: string; displayName: string; count: number } | null)[] } | null = null;
  inventory = { slots: [] as ({ type: number; name: string; displayName: string; count: number } | null)[] };
  chat = vi.fn();
  quit = vi.fn();
  acceptResourcePack = vi.fn();
  denyResourcePack = vi.fn();
  closeWindow = vi.fn();
  clickWindow = vi.fn(() => Promise.resolve());
}

const anvil = { type: 145, name: 'anvil', displayName: 'Refresh', count: 1 };

describe('MineflayerGameClientAdapter', () => {
  it('normalizes window lifecycle and suppresses duplicate slot updates', async () => {
    const bot = new BotFixture();
    const adapter = new MineflayerGameClientAdapter({ host: 'localhost', username: 'owner', botFactory: () => bot as unknown as Bot });
    const events: string[] = [];
    adapter.subscribe((event) => { events.push(event.type); });
    await adapter.connect();
    bot.emit('spawn');
    bot.currentWindow = { id: 4, type: 'minecraft:chest', title: 'Auction (Page 1)', slots: [anvil] };
    bot.emit('windowOpen', bot.currentWindow);
    bot.emit('updateSlot');
    bot.emit('windowClose', bot.currentWindow);
    expect(events).toEqual(['CLIENT_CONNECTED', 'INVENTORY_UPDATED', 'GUI_OPENED', 'GUI_CLOSED']);
    await expect(adapter.getCurrentGui()).resolves.toBeNull();
  });

  it('ignores null window events during connection transitions', async () => {
    const bot = new BotFixture();
    const adapter = new MineflayerGameClientAdapter({ host: 'localhost', username: 'owner', botFactory: () => bot as unknown as Bot });
    await adapter.connect();
    expect(() => { bot.emit('windowOpen', null); bot.emit('windowClose', null); bot.emit('windowUpdate', null); }).not.toThrow();
    await expect(adapter.getCurrentGui()).resolves.toBeNull();
  });

  it('serializes items and validates click identity before clickWindow', async () => {
    const bot = new BotFixture();
    const adapter = new MineflayerGameClientAdapter({ host: 'localhost', username: 'owner', botFactory: () => bot as unknown as Bot });
    await adapter.connect();
    bot.emit('spawn');
    bot.currentWindow = { id: 4, type: 'minecraft:chest', title: 'Auction (Page 1)', slots: [anvil] };
    bot.emit('windowOpen', bot.currentWindow);
    const gui = await adapter.getCurrentGui();
    if (gui === null) throw new Error('window missing');
    await expect(adapter.clickSlot({ slot: 0, expectedSignature: gui.signature, expectedItemFingerprint: itemFingerprint(serializeItem(anvil)) })).resolves.toMatchObject({ accepted: true });
    await expect(adapter.clickSlot({ slot: 0, expectedSignature: 'wrong' })).resolves.toMatchObject({ accepted: false });
    expect(bot.clickWindow).toHaveBeenCalledWith(0, 0, 0);
  });

  it('closes forced anvil, repair, and smithing windows by default', async () => {
    const bot = new BotFixture();
    const adapter = new MineflayerGameClientAdapter({ host: 'localhost', username: 'owner', botFactory: () => bot as unknown as Bot });
    await adapter.connect();
    const forcedWindow = { id: 5, type: 'minecraft:anvil', title: 'Repair & Name', slots: [] };
    bot.emit('windowOpen', forcedWindow);
    expect(bot.closeWindow).toHaveBeenCalledWith(forcedWindow);
    await expect(adapter.getCurrentGui()).resolves.toBeNull();
  });

  it('allows forced-window handling to be disabled', async () => {
    const bot = new BotFixture();
    const adapter = new MineflayerGameClientAdapter({ host: 'localhost', username: 'owner', exploitProtection: false, botFactory: () => bot as unknown as Bot });
    await adapter.connect();
    const window = { id: 5, type: 'minecraft:anvil', title: 'Repair & Name', slots: [] };
    bot.emit('windowOpen', window);
    expect(bot.closeWindow).not.toHaveBeenCalled();
    await expect(adapter.getCurrentGui()).resolves.toMatchObject({ title: 'Repair & Name' });
  });

  it('denies resource packs by default and only allows public HTTP(S) URLs when opted in', async () => {
    const bot = new BotFixture();
    const adapter = new MineflayerGameClientAdapter({ host: 'localhost', username: 'owner', botFactory: () => bot as unknown as Bot });
    await adapter.connect();
    bot.emit('resourcePack', 'http://127.0.0.1:8080/pack.zip', 'hash');
    expect(bot.denyResourcePack).toHaveBeenCalledOnce();
    expect(bot.acceptResourcePack).not.toHaveBeenCalled();

    const allowedBot = new BotFixture();
    const allowedAdapter = new MineflayerGameClientAdapter({ host: 'localhost', username: 'owner', resourcePackPolicy: 'allow-remote-http', botFactory: () => allowedBot as unknown as Bot });
    await allowedAdapter.connect();
    allowedBot.emit('resourcePack', 'https://cdn.example.com/pack.zip', 'hash');
    expect(allowedBot.acceptResourcePack).toHaveBeenCalledOnce();
  });

  it('recognizes safe public resource-pack URLs', () => {
    expect(isSafeResourcePackUrl('https://cdn.example.com/pack.zip')).toBe(true);
    expect(isSafeResourcePackUrl('http://localhost:8080/pack.zip')).toBe(false);
    expect(isSafeResourcePackUrl('http://192.168.1.1/pack.zip')).toBe(false);
    expect(isSafeResourcePackUrl('file:///etc/passwd')).toBe(false);
  });

  it('formats string, structured, and circular kick reasons safely', () => {
    const stringReason = formatKickReason('denied');
    expect(stringReason.rawReason).toBe('"denied"');
    expect(stringReason.readableReason).toBe('denied');
    const componentReason = formatKickReason({ text: 'Disconnected:', extra: [{ text: ' banned' }] });
    expect(componentReason.rawReason).toBe('{"text":"Disconnected:","extra":[{"text":" banned"}]}');
    expect(componentReason.readableReason).toBe('Disconnected:  banned');
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const circularReason = formatKickReason(circular);
    expect(circularReason.rawReason).toBe('{"self":"[Circular]"}');
    expect(circularReason.readableReason).toBe('{"self":"[Circular]"}');
  });

  it('captures kick diagnostics and reconnects after end', async () => {
    vi.useFakeTimers();
    const first = new BotFixture();
    const second = new BotFixture();
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const adapter = new MineflayerGameClientAdapter({ host: 'localhost', username: 'owner', reconnectDelayMs: 100, botFactory: factory });
    const diagnostics: unknown[] = [];
    adapter.subscribe((event) => { if (event.type === 'RAW_OBSERVATION') diagnostics.push(event.payload); });
    await adapter.connect();
    first.emit('kicked', 'denied');
    first.emit('end', 'lost');
    await vi.advanceTimersByTimeAsync(100);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(diagnostics).toContainEqual({ type: 'MINEFLAYER_KICKED', rawReason: '"denied"', readableReason: 'denied' });
    vi.useRealTimers();
  });
});
