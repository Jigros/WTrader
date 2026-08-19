import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadTradingConfig } from '@wtrader/config';
import { runBacktest, type HistoricalFrame } from './index.js';

const inputPath = process.argv[2];
if (inputPath === undefined) throw new Error('Usage: pnpm backtest <historical-frames.json>');
const config = await loadTradingConfig();
const raw = JSON.parse(await readFile(resolve(inputPath), 'utf8')) as HistoricalFrame[];
const frames = raw.map((frame) => ({
  ...frame,
  observedAt: new Date(frame.observedAt),
  listings: frame.listings.map((listing) => ({
    ...listing,
    firstSeenAt: new Date(listing.firstSeenAt),
    lastSeenAt: new Date(listing.lastSeenAt),
  })),
  statistics: Object.fromEntries(Object.entries(frame.statistics).map(([key, value]) => [key, {
    ...value,
    observedAt: new Date(value.observedAt),
  }])),
}));
process.stdout.write(`${JSON.stringify(runBacktest(frames, config), null, 2)}\n`);
