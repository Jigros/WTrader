# Architecture

The repository is a TypeScript monorepo separated into client integration, market ingestion, execution, pricing, risk, selling, persistence, protocol, logging, and application packages.

The client boundary isolates all external game behavior. The live trading decision path is deterministic and does not invoke an LLM. Hot market state stays in process; PostgreSQL is the durable historical store and Redis coordinates cross-account reservations.

The mock adapter is an executable contract for client behavior and supports safe end-to-end simulation without Minecraft connectivity.
