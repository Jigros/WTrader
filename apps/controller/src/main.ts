import { loadEnvironment, loadTradingConfig } from '@wtrader/config';
import { Database } from '@wtrader/database';
import { createLogger } from '@wtrader/logging';
import { TradingEventBus } from './event-bus.js';

const environment = loadEnvironment();
const config = await loadTradingConfig();
const logger = createLogger({ service: 'controller' });
const database = new Database(environment.DATABASE_URL);
const bus = new TradingEventBus();
let shuttingDown = false;

bus.on('observation', async (observation) => {
  await database.saveObservation(observation);
});

bus.on('pause', ({ reason }) => {
  logger.warn({ event: 'trading_paused', reason }, 'Trading paused');
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'shutdown_started', signal }, 'Controller shutting down');
  await database.close();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

logger.info({
  event: 'controller_started',
  activeCapital: config.capital.active,
  maxTradePercent: config.capital.maxTradePercent,
}, 'Controller started');
