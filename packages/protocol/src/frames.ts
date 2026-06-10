import { z } from 'zod'
import { ProtocolErrorSchema } from './errors.js'

/**
 * Protocol version. Bump on breaking changes only.
 */
export const PROTOCOL_VERSION = 1

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

export const HelloFrameSchema = z
  .object({
    type: z.literal('hello'),
    protocolVersion: z.number().int().positive(),
    clientId: z.string().min(1),
    clientVersion: z.string().min(1),
  })
  .strict()
export type HelloFrame = z.infer<typeof HelloFrameSchema>

export const WelcomeFrameSchema = z
  .object({
    type: z.literal('welcome'),
    protocolVersion: z.number().int().positive(),
    serverVersion: z.string().min(1),
  })
  .strict()
export type WelcomeFrame = z.infer<typeof WelcomeFrameSchema>

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

export const RequestFrameSchema = z
  .object({
    type: z.literal('req'),
    id: z.string().min(1),
    method: z.string().min(1),
    params: z.unknown().optional(),
  })
  .strict()
export type RequestFrame = z.infer<typeof RequestFrameSchema>

export const ResponseFrameSchema = z
  .object({
    type: z.literal('res'),
    id: z.string().min(1),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: ProtocolErrorSchema.optional(),
  })
  .strict()
export type ResponseFrame = z.infer<typeof ResponseFrameSchema>

// ---------------------------------------------------------------------------
// Server push
// ---------------------------------------------------------------------------

export const PUSH_EVENTS = [
  'table.created',
  'table.updated',
  'table.deleted',
  'field.created',
  'field.updated',
  'field.deleted',
  'field.reordered',
  'record.created',
  'record.updated',
  'record.deleted',
  'record.batch',
  'import.progress',
] as const
export type PushEvent = (typeof PUSH_EVENTS)[number]

export const PushFrameSchema = z
  .object({
    type: z.literal('push'),
    event: z.string().min(1),
    channel: z.string().optional(),
    data: z.unknown(),
    ts: z.number().int().nonnegative().optional(),
  })
  .strict()
export type PushFrame = z.infer<typeof PushFrameSchema>

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

export const PingFrameSchema = z
  .object({ type: z.literal('ping'), ts: z.number().int().nonnegative() })
  .strict()
export type PingFrame = z.infer<typeof PingFrameSchema>

export const PongFrameSchema = z
  .object({
    type: z.literal('pong'),
    ts: z.number().int().nonnegative(),
    serverTs: z.number().int().nonnegative(),
  })
  .strict()
export type PongFrame = z.infer<typeof PongFrameSchema>

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export const ClientFrameSchema = z.discriminatedUnion('type', [
  HelloFrameSchema,
  RequestFrameSchema,
  PingFrameSchema,
])
export type ClientFrame = z.infer<typeof ClientFrameSchema>

export const ServerFrameSchema = z.discriminatedUnion('type', [
  WelcomeFrameSchema,
  ResponseFrameSchema,
  PushFrameSchema,
  PongFrameSchema,
])
export type ServerFrame = z.infer<typeof ServerFrameSchema>

// ---------------------------------------------------------------------------
// Subscription (sent as a regular req on the "subscribe" pseudo-method)
// ---------------------------------------------------------------------------

export const SubscribeParamsSchema = z.object({ channel: z.string().min(1) }).strict()
export const UnsubscribeParamsSchema = z.object({ channel: z.string().min(1) }).strict()

/** Channel naming convention: `table.<tableId>.records`, `core.all`, etc. */
export function recordsChannel(tableId: string): string {
  return `table.${tableId}.records`
}

export function tableChannel(tableId: string): string {
  return `table.${tableId}`
}
