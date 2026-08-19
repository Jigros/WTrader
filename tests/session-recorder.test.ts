import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRecorder } from '../apps/minecraft-executor/src/session-recorder.js';

let directory = '';

afterEach(async () => { if (directory.length > 0) await rm(directory, { recursive: true, force: true }); });

describe('SessionRecorder', () => {
  it('persists and revives a replayable observation timeline', async () => {
    directory = await mkdtemp(join(tmpdir(), 'wtrader-session-'));
    const file = join(directory, 'session.jsonl');
    const recorder = new SessionRecorder('capture-1', file);
    await recorder.record({ type: 'CHAT_MESSAGE', observedAt: new Date('2026-08-19T00:00:00.000Z'), message: 'observed' });

    const replay = await SessionRecorder.read(file);
    expect(replay).toHaveLength(1);
    expect(replay[0]?.sessionId).toBe('capture-1');
    expect(replay[0]?.event).toMatchObject({ type: 'CHAT_MESSAGE', message: 'observed' });
    expect(replay[0]?.event.observedAt).toBeInstanceOf(Date);
  });
});
