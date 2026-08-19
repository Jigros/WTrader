import { describe, expect, it } from 'vitest';
import { MockGameClientAdapter } from '@wtrader/game-client';
import { deriveGuiLayoutCandidate } from '../apps/minecraft-executor/src/gui-learning.js';
import { guiSlotChanges, validateSemanticSlot } from '../apps/minecraft-executor/src/semantic-actions.js';

const button = { itemType: 'minecraft:lime_dye', displayName: 'Confirm Purchase', quantity: 1, enchantments: [], lore: ['Click to confirm buy'] };

describe('semantic GUI learning', () => {
  it('derives an observed confirmation button candidate', () => {
    const gui = MockGameClientAdapter.gui('Confirm Purchase', [{ slot: 13, item: button, rawName: 'Confirm Purchase' }]);
    const learned = deriveGuiLayoutCandidate(gui);
    expect(learned.buttonCandidates).toContainEqual(expect.objectContaining({ action: 'CONFIRM_BUY', slot: 13 }));
  });

  it('compares only changed slots and rejects altered semantic controls', () => {
    const before = MockGameClientAdapter.gui('Auction', [{ slot: 0, item: button, rawName: 'Confirm Purchase' }]);
    const after = { ...before, slots: [{ slot: 0, item: { ...button, displayName: 'Cancel' }, rawName: 'Cancel' }] };
    expect(guiSlotChanges(before, after)).toHaveLength(1);
    const result = validateSemanticSlot(after, {
      action: 'CONFIRM_BUY', guiSignature: after.signature, slot: 0, expectedItemType: 'minecraft:lime_dye', namePattern: 'Confirm Purchase', workflowStates: ['FINAL_VALIDATION'], confidence: 1,
    }, 'FINAL_VALIDATION');
    expect(result).toEqual({ approved: false, reason: 'BUTTON_NAME_MISMATCH' });
  });
});
