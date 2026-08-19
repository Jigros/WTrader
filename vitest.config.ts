import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageAliases = [
  'config',
  'database',
  'execution',
  'game-client',
  'logging',
  'market-model',
  'pricing',
  'protocol',
  'risk',
  'selling',
  'metrics',
  'shared-types',
];

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(packageAliases.map((name) => [
      `@wtrader/${name}`,
      fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
    ])),
  },
  test: {
    coverage: { reporter: ['text', 'json', 'html'] },
    include: ['tests/**/*.test.ts'],
  },
});
