import pino, { type Logger, type LoggerOptions } from 'pino';

export interface LogContext {
  readonly service: string;
  readonly botId?: string;
  readonly accountId?: string;
  readonly marketId?: string;
  readonly listingId?: string;
  readonly correlationId?: string;
}

export function createLogger(context: LogContext, options: LoggerOptions = {}): Logger {
  return pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    base: context,
    timestamp: pino.stdTimeFunctions.isoTime,
    ...options,
  });
}
