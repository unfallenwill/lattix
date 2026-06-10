import { z } from 'zod'

/**
 * Error codes returned in `res.error.code` frames.
 * Keep this list small and stable — it is part of the public protocol.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL',
  'NOT_IMPLEMENTED',
  'UNAUTHORIZED',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const ProtocolErrorSchema = z
  .object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .strict()

export interface ProtocolError {
  code: ErrorCode
  message: string
  details?: unknown
}

export class ProtocolException extends Error {
  public readonly code: ErrorCode
  public readonly details: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ProtocolException'
    this.code = code
    this.details = details
  }
}

export function toProtocolError(err: unknown): ProtocolError {
  if (err instanceof ProtocolException) {
    const out: ProtocolError = { code: err.code, message: err.message }
    if (err.details !== undefined) out.details = err.details
    return out
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL', message: err.message }
  }
  return { code: 'INTERNAL', message: String(err) }
}
