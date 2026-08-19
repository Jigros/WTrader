import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { MineflayerGameClientAdapter, itemFingerprint, serializeItem } from '@wtrader/game-client';
import type { Bot } from 'mineflayer';

class BotFixture extends EventEmitter {
  version = '1.21.1';
  currentWindow: { id: number; type: string; title: string; slots: ({ type: number; name: string; displayName: string; count: number } | null)[] } | null = null;
  inventory = { slots: [] as ({ type: number; name: string; displayName: string; count: number } | null)[] };
  chat = vi.fn();
  quit = vi.fn();
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
    expect(diagnostics).toContainEqual({ type: 'MINEFLAYER_KICKED', reason: 'denied' });
    vi.useRealTimers();
  });
});
