import type { ClientGuiSnapshot } from '@wtrader/game-client';
import { type GuiAction, type GuiActionSlot, type GuiProfile } from './gui-profile.js';

export interface StaticGuiWindowMatch {
  readonly title: string;
  readonly windowType: string;
  readonly slotCount?: number;
}

export interface StaticGuiProfileDefinition {
  readonly windows: Readonly<Record<string, StaticGuiWindowMatch>>;
  readonly listings: Readonly<Record<string, readonly number[]>>;
  readonly actions: Readonly<Record<string, Readonly<Partial<Record<GuiAction, GuiActionSlot>>>>>;
}

export class StaticGuiProfile implements GuiProfile {
  constructor(private readonly definition: StaticGuiProfileDefinition) {}

  matchesWindow(window: ClientGuiSnapshot): boolean {
    return Object.values(this.definition.windows).some((expected) => window.title === expected.title && window.windowType === expected.windowType && (expected.slotCount === undefined || window.slotCount === expected.slotCount));
  }

  listingSlots(window: ClientGuiSnapshot): readonly number[] {
    return this.windowKey(window) === null ? [] : this.definition.listings[this.windowKey(window) as string] ?? [];
  }

  getActionSlot(action: GuiAction, window: ClientGuiSnapshot): GuiActionSlot | null {
    const key = this.windowKey(window);
    return key === null ? null : this.definition.actions[key]?.[action] ?? null;
  }

  validateActionSlot(action: GuiAction, window: ClientGuiSnapshot): boolean {
    return this.getActionSlot(action, window) !== null;
  }

  private windowKey(window: ClientGuiSnapshot): string | null {
    return Object.entries(this.definition.windows).find(([, expected]) => window.title === expected.title && window.windowType === expected.windowType && (expected.slotCount === undefined || window.slotCount === expected.slotCount))?.[0] ?? null;
  }
}
