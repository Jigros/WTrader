import type { GameClientEvent } from '../models.js';
import { MockGameClientAdapter } from '../mock/index.js';

export class ReplayGameClientAdapter extends MockGameClientAdapter {
  constructor(initialBalance: number, private readonly events: readonly GameClientEvent[]) {
    super(initialBalance);
  }

  async replay(delayMs = 0): Promise<void> {
    for (const event of this.events) {
      if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      if (event.type === 'GUI_OPENED' || event.type === 'GUI_UPDATED') this.setGui(event.gui);
      if (event.type === 'CLIENT_DISCONNECTED') await this.disconnect();
    }
  }
}
