import { describe, expect, it, vi } from 'vitest';
import { ActionPolicy, PolicyEnforcedGameClient, type GameClientAdapter } from '@wtrader/game-client';

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
