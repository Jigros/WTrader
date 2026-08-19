import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { GameClientEvent } from '@wtrader/game-client';

export interface RecordedSessionEvent {
  readonly sessionId: string;
  readonly sequence: number;
  readonly recordedAt: Date;
  readonly event: GameClientEvent;
}

export class SessionRecorder {
  private sequence = 0;

  constructor(private readonly sessionId: string, private readonly destination: string) {}

  async record(event: GameClientEvent): Promise<RecordedSessionEvent> {
    const entry: RecordedSessionEvent = { sessionId: this.sessionId, sequence: this.sequence, recordedAt: new Date(), event };
    this.sequence += 1;
    await mkdir(dirname(resolve(this.destination)), { recursive: true });
    await appendFile(this.destination, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  }

  static async read(source: string): Promise<RecordedSessionEvent[]> {
    const content = await readFile(source, 'utf8');
    return content.split('\n').filter((line) => line.length > 0).map((line) => {
      const parsed = JSON.parse(line) as RecordedSessionEvent;
      return { ...parsed, recordedAt: new Date(parsed.recordedAt), event: reviveEvent(parsed.event) };
    });
  }
}

function reviveEvent(event: GameClientEvent): GameClientEvent {
  const observedAt = new Date(event.observedAt);
  switch (event.type) {
    case 'GUI_OPENED':
    case 'GUI_UPDATED': return { ...event, observedAt, gui: { ...event.gui, observedAt: new Date(event.gui.observedAt) } };
    case 'INVENTORY_UPDATED': return { ...event, observedAt, inventory: { ...event.inventory, observedAt: new Date(event.inventory.observedAt) } };
    default: return { ...event, observedAt };
  }
}
