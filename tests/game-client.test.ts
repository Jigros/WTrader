import { describe, expect, it, vi } from 'vitest';
import { ActionPolicy, ExternalGameClientAdapter, PolicyEnforcedGameClient, type GameClientAdapter, type ExternalTransport } from '@wtrader/game-client';
import { parseInboundMessage } from '@wtrader/protocol';

describe('ActionPolicy', () => {
  it('allows only explicitly approved commands', () => {
    const policy = new ActionPolicy({ allowedCommands: ['/ah'] });
    expect(policy.authorize({ type: 'RUN_COMMAND', command: '/ah' })).toBe(true);
    expect(policy.authorize({ type: 'RUN_COMMAND', command: '/pay attacker 1000000' })).toBe(false);
  });

  it('blocks unauthorized commands before reaching the client', async () => {
    const executeCommand = vi.fn(() => Promise.resolve({ accepted: true }));
    const client: GameClientAdapter = {
      connect: () => Promise.resolve(), disconnect: () => Promise.resolve(),
      getState: () => Promise.resolve('READY'), getBalance: () => Promise.resolve(1),
      getInventory: () => Promise.resolve({ observedAt: new Date(), entries: [] }),
      executeCommand, openAuctionHouse: () => Promise.resolve(), getCurrentGui: () => Promise.resolve(null),
      clickSlot: () => Promise.resolve({ accepted: true, changed: true }), subscribe: () => () => undefined,
    };
    const safeClient = new PolicyEnforcedGameClient(client, new ActionPolicy({ allowedCommands: ['/ah'] }));
    await expect(safeClient.executeCommand('/op user')).rejects.toThrow('rejected by policy');
    expect(executeCommand).not.toHaveBeenCalled();
  });
});

describe('ExternalGameClientAdapter', () => {
  it('applies structured observer frames in sequence without outbound actions', async () => {
    let receive: ((message: unknown) => void) | undefined;
    const send = vi.fn();
    const transport: ExternalTransport = {
      connect: (handler) => { receive = handler; return Promise.resolve(); },
      disconnect: () => Promise.resolve(),
      send,
    };
    const client = new ExternalGameClientAdapter(transport);
    const events: string[] = [];
    client.subscribe((event) => events.push(event.type));
    await client.connect();
    const item = { itemType: 'minecraft:diamond', displayName: 'Diamond', quantity: 1, enchantments: [] };
    receive?.({ protocolVersion: 1, type: 'client.connected', sequence: 1, timestamp: 1, payload: {} });
    receive?.({ protocolVersion: 1, type: 'gui.opened', sequence: 2, timestamp: 2, payload: { id: 'auction', observedAt: 2, title: 'Auction', slotCount: 54, slots: [], signature: 'auction-1' } });
    receive?.({ protocolVersion: 1, type: 'gui.slot_delta', sequence: 3, timestamp: 3, payload: { guiId: 'auction', slot: { slot: 0, item }, signature: 'auction-2' } });
    receive?.({ protocolVersion: 1, type: 'inventory.snapshot', sequence: 4, timestamp: 4, payload: { entries: [{ slot: 0, item }] } });
    receive?.({ protocolVersion: 1, type: 'inventory.delta', sequence: 5, timestamp: 5, payload: { slot: 0, item: null } });
    receive?.({ protocolVersion: 1, type: 'manual.click', sequence: 6, timestamp: 6, payload: { slot: 0, guiId: 'auction', guiSignature: 'auction-2' } });
    receive?.({ protocolVersion: 1, type: 'gui.closed', sequence: 7, timestamp: 7, payload: { guiId: 'auction' } });
    receive?.({ protocolVersion: 1, type: 'client.disconnected', sequence: 8, timestamp: 8, payload: {} });
    receive?.({ protocolVersion: 1, type: 'chat.message', sequence: 8, timestamp: 9, payload: { message: 'ignored' } });
    expect(events).toEqual(['CLIENT_CONNECTED', 'GUI_OPENED', 'GUI_UPDATED', 'INVENTORY_UPDATED', 'INVENTORY_UPDATED', 'RAW_OBSERVATION', 'GUI_CLOSED', 'CLIENT_DISCONNECTED']);
    expect(await client.getInventory()).toEqual({ observedAt: new Date(5), entries: [] });
    expect(await client.getCurrentGui()).toBeNull();
    await expect(client.executeCommand('/ah')).rejects.toThrow('observe-only');
    await expect(client.openAuctionHouse()).rejects.toThrow('observe-only');
    await expect(client.clickSlot({ slot: 0 })).rejects.toThrow('observe-only');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects oversized structured payloads', () => {
    expect(() => parseInboundMessage({ protocolVersion: 1, type: 'chat.message', sequence: 1, timestamp: 1, payload: { message: 'x'.repeat(4_097) } })).toThrow();
  });
});
