import { z } from 'zod';

const rawItemSchema = z.object({
  itemType: z.string().min(1),
  displayName: z.string(),
  quantity: z.number().int().positive(),
  durability: z.number().int().nonnegative().optional(),
  enchantments: z.array(z.object({ id: z.string().min(1), level: z.number().int().nonnegative() })),
  relevantNbt: z.record(z.string(), z.unknown()).optional(),
  customMetadata: z.record(z.string(), z.unknown()).optional(),
  lore: z.array(z.string()).optional(),
});

const guiSchema = z.object({
  id: z.string().min(1),
  observedAt: z.coerce.date(),
  title: z.string(),
  slotCount: z.number().int().nonnegative(),
  slots: z.array(z.object({
    slot: z.number().int().nonnegative(),
    item: rawItemSchema.nullable(),
    rawName: z.string().optional(),
    lore: z.array(z.string()).optional(),
    quantity: z.number().int().positive().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })),
  signature: z.string().min(1),
});

export const inboundProtocolMessageSchema = z.discriminatedUnion('type', [
  z.object({ protocolVersion: z.literal(1), type: z.literal('client.connected'), sequence: z.number().int().nonnegative(), timestamp: z.number().int(), payload: z.object({}) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('client.disconnected'), sequence: z.number().int().nonnegative(), timestamp: z.number().int(), payload: z.object({ reason: z.string().optional() }) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('gui.snapshot'), sequence: z.number().int().nonnegative(), timestamp: z.number().int(), payload: guiSchema }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('balance.updated'), sequence: z.number().int().nonnegative(), timestamp: z.number().int(), payload: z.object({ balance: z.number().nonnegative() }) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('inventory.updated'), sequence: z.number().int().nonnegative(), timestamp: z.number().int(), payload: z.object({ observedAt: z.coerce.date(), entries: z.array(z.object({ slot: z.number().int().nonnegative(), item: rawItemSchema })) }) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('chat.message'), sequence: z.number().int().nonnegative(), timestamp: z.number().int(), payload: z.object({ message: z.string() }) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('screen.closed'), sequence: z.number().int().nonnegative(), timestamp: z.number().int(), payload: z.object({ guiId: z.string().min(1) }) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('manual.slot_click'), sequence: z.number().int().nonnegative(), timestamp: z.number().int(), payload: z.object({ slot: z.number().int().nonnegative(), guiId: z.string().min(1), guiSignature: z.string().min(1) }) }),
]);

export const outboundProtocolMessageSchema = z.discriminatedUnion('type', [
  z.object({ protocolVersion: z.literal(1), type: z.literal('command.execute'), requestId: z.string().min(1), payload: z.object({ command: z.string().regex(/^\/[a-zA-Z0-9_-]+$/) }) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('auction.open'), requestId: z.string().min(1), payload: z.object({}) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('slot.click'), requestId: z.string().min(1), payload: z.object({ slot: z.number().int().nonnegative(), expectedSignature: z.string().optional(), expectedItemFingerprint: z.string().optional() }) }),
  z.object({ protocolVersion: z.literal(1), type: z.literal('state.request'), requestId: z.string().min(1), payload: z.object({}) }),
]);

export type InboundProtocolMessage = z.infer<typeof inboundProtocolMessageSchema>;
export type OutboundProtocolMessage = z.infer<typeof outboundProtocolMessageSchema>;

export function parseInboundMessage(input: unknown): InboundProtocolMessage {
  return inboundProtocolMessageSchema.parse(input);
}

export function parseOutboundMessage(input: unknown): OutboundProtocolMessage {
  return outboundProtocolMessageSchema.parse(input);
}
