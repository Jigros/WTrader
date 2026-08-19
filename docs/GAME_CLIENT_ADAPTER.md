# Game Client Adapter

The engine depends only on `GameClientAdapter`, never a specific Minecraft library. The interface provides normalized connection state, balance, inventory, GUI snapshots, commands, clicks, and event subscription.

Implementations:

- `MockGameClientAdapter` provides deterministic lifecycle simulation.
- `ReplayGameClientAdapter` replays recorded normalized events.
- `ExternalGameClientAdapter` accepts a local authorized-client transport.

The external protocol is versioned JSON (`protocolVersion: 1`) and validates inbound messages with Zod before application use. Supported observations are client connection, GUI snapshots, balances, inventory, and chat. Outbound actions are limited to configured commands, open-AH requests, guarded slot clicks, and state requests.

Phase 3 adds semantic GUI guards. Learned action slots are validated against the current GUI signature, workflow state, item type, name, and lore immediately before a click. A mismatch rejects the action.

A real integration still requires observed DonutSMP-specific GUI layouts, lore formats, command responses, and confirmation evidence. Those details are intentionally not fabricated.
