import { z } from 'zod';

const maximumTextLength = 4_096;
const maximumSlots = 256;
const maximumLoreLines = 128;
const boundedText = z.string().max(maximumTextLength);
const identifier = z.string().min(1).max(256);
const metadata = z.record(z.string().max(128), z.unknown());
const rawItemSchema = z.object({
  itemType: identifier,
  displayName: boundedText,
  quantity: z.number().int().positive().max(64),
  durability: z.number().int().nonnegative().max(1_000_000).optional(),
  enchantments: z.array(z.object({ id: identifier, level: z.number().int().nonnegative().max(255) })).max(64),
  relevantNbt: metadata.optional(),
  customMetadata: metadata.optional(),
  lore: z.array(boundedText).max(maximumLoreLines).optional(),
});
const guiSlotSchema = z.object({
  slot: z.number().int().nonnegative().max(maximumSlots - 1),
  item: rawItemSchema.nullable(),
  rawName: boundedText.optional(),
  lore: z.array(boundedText).max(maximumLoreLines).optional(),
  quantity: z.number().int().positive().max(64).optional(),
  metadata: metadata.optional(),
});
const guiSchema = z.object({
  id: identifier,
  observedAt: z.coerce.date(),
  title: boundedText,
  slotCount: z.number().int().nonnegative().max(maximumSlots),
  slots: z.array(guiSlotSchema).max(maximumSlots),
  signature: identifier,
});
const frame = <Type extends string, T extends z.ZodType>(type: Type, payload: T) => z.object({
  protocolVersion: z.literal(1), type: z.literal(type), sequence: z.number().int().nonnegative(), timestamp: z.number().int().nonnegative(), payload,
});
const inventoryEntrySchema = z.object({ slot: z.number().int().nonnegative().max(maximumSlots - 1), item: rawItemSchema });
const inventoryDeltaSchema = z.object({ slot: z.number().int().nonnegative().max(maximumSlots - 1), item: rawItemSchema.nullable() });

export const inboundProtocolMessageSchema = z.discriminatedUnion('type', [
  frame('client.connected', z.object({})),
  frame('client.disconnected', z.object({ reason: boundedText.optional() })),
  frame('gui.opened', guiSchema),
  frame('gui.snapshot', guiSchema),
  frame('gui.slot_delta', z.object({ guiId: identifier, slot: guiSlotSchema, signature: identifier.optional() })),
  frame('gui.closed', z.object({ guiId: identifier })),
  frame('balance.updated', z.object({ balance: z.number().nonnegative().max(1_000_000_000_000) })),
  frame('inventory.snapshot', z.object({ observedAt: z.coerce.date().optional(), entries: z.array(inventoryEntrySchema).max(maximumSlots) })),
  frame('inventory.delta', inventoryDeltaSchema),
  frame('chat.message', z.object({ message: boundedText })),
  frame('manual.click', z.object({ slot: z.number().int().nonnegative().max(maximumSlots - 1), guiId: identifier, guiSignature: identifier })),
  frame('inventory.updated', z.object({ observedAt: z.coerce.date(), entries: z.array(inventoryEntrySchema).max(maximumSlots) })),
  frame('screen.closed', z.object({ guiId: identifier })),
  frame('manual.slot_click', z.object({ slot: z.number().int().nonnegative().max(maximumSlots - 1), guiId: identifier, guiSignature: identifier })),
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
