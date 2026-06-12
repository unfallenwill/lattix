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
 * Surface shape mirrors the wire method name as a dotted path:
 *   `record.list`       → `client.records.list({...})`
 *   `field.types.list`  → `client.field.types.list({})`
 * The runtime is a recursive Proxy: each segment access returns a new
 * Proxy carrying the accumulated path; when that path matches a known
 * wire method, invoking it dispatches through the connection.
 *
 * Adding a new MethodDef shows up here automatically — there is no per-
 * method wrapper to maintain.
 */
import { ALL_METHODS, type AllMethods, type MethodKey } from '@lattix/protocol'
import type { ParamsOf, ResultOf } from '@lattix/protocol'
import type { LattixConnection } from './connection.js'

// --- type-level method projection ---------------------------------------

/**
 * Project ALL_METHODS into a nested object type whose leaves are typed
 * call signatures. We do it recursively over the dotted method name:
 *
 *   {
 *     core:   { health: (p) => Promise<...>, version: (...) }
 *     table:  { list: (p) => ..., get: (p) => ..., ... }   // singular wire
 *     field:  { list, create, update, delete, reorder, types: { list } }
 *     record: { list, get, create, update, delete, batch, import }
 *   }
 *
 * The PluraliseDomain step then renames the top-level keys (`table` →
 * `tables`, `field` → `fields`, `record` → `records`) so the client
 * reads as `client.tables.list()` etc.
 *
 * `field.types.list` keeps its second segment intact, because we only
 * pluralise the top level — `client.field.types.list({})` is still the
 * surface form, and it routes to wire name `field.types.list`.
 */
type CallSignatureFor<K extends MethodKey> = (
  params: ParamsOf<AllMethods[K]>,
) => Promise<ResultOf<AllMethods[K]>>

/** Recursive shape: any prefix of any method name shows up as a sub-object. */
type RouteTreeFor<Prefix extends string> = {
  [K in MethodKey as K extends `${Prefix}.${infer Next}`
    ? Next extends `${infer Head}.${string}`
      ? Head
      : Next
    : never]: K extends `${Prefix}.${infer Next}`
    ? Next extends `${string}.${string}`
      ? RouteTreeFor<`${Prefix}.${TopOf<Next>}`>
      : K extends MethodKey
        ? CallSignatureFor<K>
        : never
    : never
}

type TopOf<S extends string> = S extends `${infer H}.${string}` ? H : S

type FirstSegment<K extends string> = K extends `${infer H}.${string}` ? H : K
type Domains = FirstSegment<MethodKey>

type PluraliseDomain<D extends string> = D extends 'table'
  ? 'tables'
  : D extends 'field'
    ? 'fields'
    : D extends 'record'
      ? 'records'
      : D

export type LattixClientShape = {
  // Singular form — always available. Required for nested wire names
  // like `field.types.list` where pluralising would change the prefix.
  [D in Domains]: RouteTreeFor<D>
} & {
  // Plural alias for the simple domains, kept because `client.tables.list()`
  // reads better than `client.table.list()`. For domains that have nested
  // children (e.g. `field.types.list`), the plural alias still resolves to
  // the same route tree — the runtime translates `fields → field` on call.
  [D in Domains as PluraliseDomain<D> extends D ? never : PluraliseDomain<D>]: RouteTreeFor<D>
}

// --- runtime ------------------------------------------------------------

const SINGULAR_OF_PLURAL: Record<string, string> = {
  tables: 'table',
  fields: 'field',
  records: 'record',
}

/**
 * Build the runtime client. Uses a recursive Proxy: each property access
 * extends an accumulating dotted path; calling the proxy treats the path
 * as a method name and dispatches via Connection.request.
 *
 * Children of `field.types.list` and `field.list` coexist because we
 * decide at call time, not at property-access time: if the accumulated
 * path is a known method we route it; otherwise we keep returning proxies
 * that can be drilled further.
 */
export function createClient(conn: LattixConnection): LattixClient {
  const cache = new Map<string, unknown>()
  const make = (path: string[]): unknown => {
    const key = path.join('.')
    const cached = cache.get(key)
    if (cached) return cached
    // A function so the proxy is callable; the property trap handles drill-down.
    const fn = (params: unknown): Promise<unknown> => {
      // Translate plural top-level segments back to the singular wire name.
      const wireParts = [...path]
      const head = wireParts[0]
      if (head && head in SINGULAR_OF_PLURAL) {
        wireParts[0] = SINGULAR_OF_PLURAL[head] as string
      }
      const wireName = wireParts.join('.') as MethodKey
      if (!(wireName in ALL_METHODS)) {
        return Promise.reject(new Error(`Unknown method: ${wireName}`))
      }
      return conn.request(wireName, params)
    }
    const node = new Proxy(fn, {
      get(target, prop: string | symbol) {
        // Let symbol-keyed and function-bookkeeping props fall through to
        // the underlying function. Otherwise things like Promise resolution
        // (`then`), array iteration, or `util.inspect` end up drilling
        // into the proxy and producing nonsense paths.
        if (typeof prop !== 'string') {
          return Reflect.get(target, prop)
        }
        if (
          prop === 'then' ||
          prop === 'catch' ||
          prop === 'finally' ||
          prop === 'toString' ||
          prop === 'toJSON' ||
          prop === 'valueOf' ||
          prop === 'constructor' ||
          prop === 'name' ||
          prop === 'length' ||
          prop === 'apply' ||
          prop === 'call' ||
          prop === 'bind' ||
          prop === 'prototype' ||
          prop.startsWith('_')
        ) {
          return Reflect.get(target, prop)
        }
        return make([...path, prop])
      },
    })
    cache.set(key, node)
    return node
  }
  return make([]) as LattixClient
}

/** Public type — what `createClient()` returns. */
export type LattixClient = LattixClientShape
