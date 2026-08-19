import { describe, expect, it } from 'vitest';
import { formatRawGuiSlot, formatRawGuiWindow, formatSmokeEvent, mineflayerOptionsFromEnvironment } from '../apps/minecraft-executor/src/mineflayer-main.js';

describe('Mineflayer smoke runner helpers', () => {
  it('reads required configuration without credentials beyond username', () => {
    expect(mineflayerOptionsFromEnvironment({ MINECRAFT_HOST: 'localhost', MINECRAFT_USERNAME: 'owner', MINECRAFT_EARLY_CLIENT_INFORMATION: 'true', MINECRAFT_BRAND: 'vanilla', MINECRAFT_LOCALE: 'en_us', MINECRAFT_VIEW_DISTANCE: '12' })).toEqual({ host: 'localhost', port: 25565, username: 'owner', profilesFolder: '.minecraft-auth', earlyClientInformation: true, brand: 'vanilla', locale: 'en_us', viewDistance: 12 });
    expect(() => mineflayerOptionsFromEnvironment({ MINECRAFT_HOST: 'localhost' })).toThrow('MINECRAFT_USERNAME is required');
  });

  it('bounds allowlisted raw GUI diagnostics', () => {
    const rawItem = { name: 'diamond', type: 264, count: 2, nbt: { display: { Name: 'Diamond' } }, token: 'secret' };
    expect(formatRawGuiSlot(rawItem, '13')).toContain('"name": "diamond"');
    expect(formatRawGuiSlot(rawItem, '13')).not.toContain('secret');
    expect(formatRawGuiWindow({ id: 1, type: 'minecraft:generic_9x3', title: 'Confirm Purchase', slots: [null, rawItem] })).toContain('"slot": 1');
  });

  it('formats concise GUI update events', () => {
    expect(formatSmokeEvent({ type: 'GUI_UPDATED', observedAt: new Date(), gui: { id: 'window-1', observedAt: new Date(), title: 'Auction (Page 1)', slotCount: 54, slots: [], signature: 'signature' } })).toBe('[GUI_UPDATED] title=Auction (Page 1) id=window-1 slots=54');
  });
});
