import type { ZodTypeAny, z } from 'zod'

/**
 * Single source of truth for one RPC method: its wire name, its zod
 * schemas for params + result, and a short summary used in docs / IDE
 * hovers.
 *
 * Why this exists:
 *   - Router can register a handler against a MethodDef and the handler's
 *     params type is automatically inferred from `paramsSchema` — no more
 *     `as unknown as z.infer<typeof X>` casts.
 *   - Client SDK can use the same MethodDef to generate a typed call
 *     whose params type comes from `z.input<paramsSchema>` and whose
 *     return type comes from `z.output<resultSchema>`.
 *   - Adding a new method = one `defineMethod()` + one `register()` call,
 *     instead of the previous 5-touchpoint dance (METHOD_NAMES set,
 *     PARAM_SCHEMAS record, Router switch case, client string literal,
 *     client `as` cast).
 *
 * resultSchema is NOT enforced at runtime by the client (cost of zod-
 * parsing every response is too high for list calls; clients trust their
 * own server). It exists so `z.output<resultSchema>` flows into the
 * caller's return type at compile time.
 */
export interface MethodDef<
  ParamsSchema extends ZodTypeAny = ZodTypeAny,
  ResultSchema extends ZodTypeAny = ZodTypeAny,
> {
  name: string
  paramsSchema: ParamsSchema
  resultSchema: ResultSchema
  summary: string
}

/**
 * Identity helper — its only job is to pin the generic params so
 * `z.input<def.paramsSchema>` and friends infer at the call site
 * instead of collapsing to `ZodTypeAny`.
 */
export function defineMethod<P extends ZodTypeAny, R extends ZodTypeAny>(
  def: MethodDef<P, R>,
): MethodDef<P, R> {
  return def
}

/** Params type the caller passes (with defaults still optional). */
export type ParamsOf<D extends MethodDef> = z.input<D['paramsSchema']>

/** Params type after schema.parse() — defaults are filled in. */
export type ParsedParamsOf<D extends MethodDef> = z.output<D['paramsSchema']>

/** Result type the caller receives. */
export type ResultOf<D extends MethodDef> = z.output<D['resultSchema']>
