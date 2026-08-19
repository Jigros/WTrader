# DonutSMP Fabric Observer Bridge

This Fabric **client-side**, owner-authorized mod is the Phase 4 transport boundary. It connects only to `ws://127.0.0.1:32100`, emits structured observations, and deliberately has no handlers for commands, clicks, inventory mutation, or packet automation.

## Required emitted protocol frames

Use the v1 frames defined in `packages/protocol/src/index.ts`:

- `client.connected` and `client.disconnected`
- `gui.snapshot` on screen open and slot changes
- `screen.closed` on screen close
- `inventory.snapshot` when the player inventory changes
- `chat.message` for received chat
- `balance.updated` only when player-visible balance is observed
- `manual.slot_click` for owner-performed slot actions

Frames must contain increasing `sequence`, millisecond `timestamp`, and `protocolVersion: 1`. Connect with `Authorization: Bearer <BRIDGE_TOKEN>` if a backend token is configured. Never transmit authentication credentials, session tokens, or player chat beyond the locally authorized bridge.

## Fabric implementation checklist

1. Target the Minecraft/Fabric version used by the owner's local client.
2. Register client-only screen lifecycle, handled-screen slot, chat, inventory, and disconnect listeners.
3. Serialize item identifier, display name, lore, count, and bounded, relevant component/NBT metadata from client-visible state.
4. Send frames over the local WebSocket in observation order; reconnect safely on a local bridge restart.
5. Do not add packet hooks, automated interactions, outgoing commands, or action receivers.

Start the backend with `pnpm bridge:observe <session-id>` while its safety mode is `OBSERVE_ONLY`. A real capture is needed before this repository can create trusted DonutSMP GUI mappings.
