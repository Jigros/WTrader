import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const confidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA']);

const tradingConfigSchema = z.object({
  capital: z.object({
    active: z.number().positive(),
    maxTradePercent: z.number().positive().max(1),
    maxItemExposurePercent: z.number().positive().max(1),
  }),
  trading: z.object({
    sameDayExitPreferred: z.boolean(),
    allowLossSelling: z.literal(false),
    minimumAbsoluteProfit: z.number().nonnegative(),
    dynamicRoi: z.object({
      base: z.number().nonnegative(),
      volatilityWeight: z.number().nonnegative(),
      illiquidityWeight: z.number().nonnegative(),
      holdingHourWeight: z.number().nonnegative(),
      lowConfidencePenalty: z.number().nonnegative(),
      highTurnoverBonus: z.number().nonnegative(),
      minimum: z.number().nonnegative(),
      maximum: z.number().positive(),
    }).refine((value) => value.maximum >= value.minimum, 'maximum ROI must be at least minimum ROI'),
    minimumConfidence: confidenceSchema,
    maxDailyLoss: z.number().positive(),
    maxConsecutiveExecutionFailures: z.number().int().positive(),
  }),
  pricing: z.object({
    emaAlpha: z.number().positive().max(1),
    outlierIqrMultiplier: z.number().positive(),
    staleAfterMs: z.number().int().positive(),
    minimumSamples: z.number().int().positive(),
  }),
  risk: z.object({
    unknownGuiAction: z.literal('stop'),
    staleMarketAction: z.literal('pause'),
    listingLockTtlMs: z.number().int().positive(),
  }),
  execution: z.object({
    safetyMode: z.enum(['OBSERVE_ONLY', 'ASSISTED', 'LIVE', 'PAUSED']).default('OBSERVE_ONLY'),
    allowedCommands: z.array(z.string().regex(/^\/[a-zA-Z0-9_-]+$/)),
    clickConfirmationRequired: z.boolean(),
    liveBuyTest: z.object({
      executeOnce: z.literal(true),
      maxPrice: z.number().positive(),
    }).optional(),
  }),
  mineflayer: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(25565),
    username: z.string().min(1),
    version: z.string().min(1).optional(),
    profilesFolder: z.string().min(1).optional(),
    reconnectDelayMs: z.number().int().positive().default(5_000),
    resourcePackPolicy: z.enum(['deny', 'allow-remote-http']).default('deny'),
    exploitProtection: z.boolean().default(true),
    closeForcedSignEditor: z.boolean().default(false),
  }).optional(),
  bridge: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().min(1024).max(65535).default(32100),
    token: z.string().min(16).optional(),
    maximumFrameBytes: z.number().int().positive().default(262_144),
  }).optional().default({ host: '127.0.0.1', port: 32100, maximumFrameBytes: 262_144 }),
  market: z.object({
    blacklistedItemTypes: z.array(z.string().min(1)),
  }),
  selling: z.object({
    minimumTick: z.number().positive(),
    targetRoi: z.number().nonnegative(),
    minimumRepricingIntervalMs: z.number().int().positive(),
    minimumMeaningfulDelta: z.number().positive(),
    maximumRepricesPerHour: z.number().int().positive(),
  }),
});

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().min(1).default('postgresql://wtrader:wtrader@localhost:5432/wtrader'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  TRADING_CONFIG_PATH: z.string().min(1).default('config/default.yaml'),
});

export type TradingConfig = z.infer<typeof tradingConfigSchema>;
export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(input: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(input);
}

export async function loadTradingConfig(path?: string): Promise<TradingConfig> {
  const environment = loadEnvironment();
  const configPath = resolve(path ?? environment.TRADING_CONFIG_PATH);
  const source = await readFile(configPath, 'utf8');
  return tradingConfigSchema.parse(parse(source));
}

export function parseTradingConfig(input: unknown): TradingConfig {
  return tradingConfigSchema.parse(input);
}
