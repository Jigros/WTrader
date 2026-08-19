# WTrader

Autonomous Auction House trading platform foundation for DonutSMP, with deterministic market analysis, risk limits, and a safe client-integration boundary.

## Setup

```bash
cp .env.example .env
corepack pnpm install
docker compose up -d postgres redis
corepack pnpm db:migrate
```

## Commands

```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
corepack pnpm simulate:e2e
corepack pnpm benchmark:hot-path
```

The mock end-to-end test is the supported local validation path. A real client must use the versioned, validated external adapter protocol and must not bypass game protections.
