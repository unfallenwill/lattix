/**
 * Typed client facade — wraps a LattixConnection and exposes one method
 * per MethodDef in @lattix/protocol/ALL_METHODS, with params type from
 * `z.input<def.paramsSchema>` and return type from
 * `z.output<def.resultSchema>`.
 *
 * Wire calls still go through Connection.request(); this layer adds:
 *   - compile-time method-name checking (typos are TS errors)
 *   - compile-time params shape checking
 *   - automatic return type inference (callers no longer write
 *     `as { records: RecordRow[] }` etc.)
 *
 * Surface shape: `client.<domain>.<action>(params)`, mirroring the
 * `domain.action` naming of the wire methods. Implementation is a
 * 2-level Proxy that consults ALL_METHODS at call time — no per-method
 * hand-written wrappers — so adding a new MethodDef is automatically
 * reachable through the client with zero changes here.
 */
import { ALL_METHODS, type AllMethods, type MethodKey } from '@lattix/protocol'
import type { ParamsOf, ResultOf } from '@lattix/protocol'
import type { LattixConnection } from './connection.js'

// --- type-level method projection ---------------------------------------

/**
 * Split each "domain.action" MethodKey into `domain` and `action`, then
 * group the typed call-signatures under the domain. The result type is
 * what `LattixClient` looks like to a user — `client.tables.list()` etc.
 */
type DomainOf<K extends string> = K extends `${infer D}.${string}` ? D : never
type ActionOf<K extends string, D extends string> = K extends `${D}.${infer A}` ? A : never

type CallSignature<D> = D extends MethodKey
  ? (params: ParamsOf<AllMethods[D]>) => Promise<ResultOf<AllMethods[D]>>
  : never

// `keyof any extends string` — restrict to string keys for the template
// literal magic above to apply.
type Domains = DomainOf<MethodKey>

type DomainShape<D extends Domains> = {
  [A in ActionOf<MethodKey, D> as A extends string
    ? CamelToHyphen<A> extends never
      ? A
      : A
    : never]: CallSignature<`${D}.${A}` & MethodKey>
}

// Reserved for future name-mapping (e.g. record.list -> records.list);
// currently the identity, kept here so changes happen in one place.
type CamelToHyphen<S extends string> = S

/**
 * Pluralised domain mapping: wire `table.*` is exposed as `client.tables.*`
 * for readability ("list tables" reads better than "list table"). Add new
 * entries here when a new domain is introduced.
 */
type PluraliseDomain<D extends string> = D extends 'table'
  ? 'tables'
  : D extends 'field'
    ? 'fields'
    : D extends 'record'
      ? 'records'
      : D

export type LattixClientShape = {
  [D in Domains as PluraliseDomain<D>]: DomainShape<D>
}

// --- runtime ------------------------------------------------------------

const SINGULAR: Record<string, string> = {
  tables: 'table',
  fields: 'field',
  records: 'record',
}

function rawDomain(pluralOrRaw: string): string {
  return SINGULAR[pluralOrRaw] ?? pluralOrRaw
}

/**
 * Build the runtime client. Implemented as a 2-level Proxy so a new
 * MethodDef shows up automatically — there is no per-method wrapper to
 * maintain.
 */
export function createClient(conn: LattixConnection): LattixClient {
  const domainCache = new Map<string, unknown>()
  return new Proxy({} as LattixClient, {
    get(_target, pluralDomain: string) {
      if (typeof pluralDomain !== 'string') return undefined
      const cached = domainCache.get(pluralDomain)
      if (cached) return cached
      const rd = rawDomain(pluralDomain)
      const domain = new Proxy(
        {},
        {
          get(_d, action: string) {
            if (typeof action !== 'string') return undefined
            const wireName = `${rd}.${action}` as MethodKey
            if (!(wireName in ALL_METHODS)) {
              // Surface as an undefined property — keeps `'list' in client.tables`
              // semantics honest and lets callers fail with the usual JS error.
              return undefined
            }
            return (params: unknown) => conn.request(wireName, params)
          },
        },
      )
      domainCache.set(pluralDomain, domain)
      return domain
    },
  })
}

/** Public type — what `createClient()` returns. */
export type LattixClient = LattixClientShape
