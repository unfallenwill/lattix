/**
 * FieldTypeManifest — the SSOT for "what does it mean to be a field type".
 *
 * The old FieldTypeDefinition (still in field-registry.ts, soon a subset
 * of this) covered just validate / serialize / defaultValue. Manifest
 * adds the dimensions that future work needs:
 *
 *   - operators           what filter ops / sort modes / aggregations
 *                         the type supports — consumed by future
 *                         query / data-query / formula layers
 *   - storage             the SQL column the runtime persists into,
 *                         and whether the type is indexable
 *   - displayName / icon  surface metadata for clients that build a
 *                         "new field" picker without hardcoding types
 *   - optionsSchema       JSON-Schema-shaped description of the field's
 *                         options, so a client can render a form
 *   - valueSchema         describes a single cell value, used by codegen
 *                         and runtime sanity checks
 *   - category            'primitive' | 'reference' | 'computed' | 'system'
 *                         drives "can the user pick this from a menu"
 *                         and "is this a write target"
 *
 * We deliberately don't add a plugin-loader concept here. Manifest is
 * the *interface*; how manifests get into the runtime registry (static
 * import today, glob tomorrow, plugin loader after that) is a separate
 * dimension that can evolve without changing the contract.
 */
import type { FieldType } from '@lattix/protocol'
import type { ZodTypeAny } from 'zod'

// --- enums -------------------------------------------------------------

/**
 * Filter ops a field type can be compared with. Aligned with what a
 * typed query layer (Airtable / Notion / Base) would expose; not every
 * type supports every op — see manifest.operators.filter.
 */
export type FilterOp =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'

/** How a sort engine should compare two cell values of this type. */
export type SortMode = 'natural' | 'numeric' | 'date' | 'boolean' | 'none'

/** Aggregations that make sense for this type — drives future data-query. */
export type AggregateOp = 'count' | 'count_unique' | 'count_empty' | 'sum' | 'avg' | 'min' | 'max'

/** SQLite physical column type used for the persisted value. */
export type StorageSqlType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'

/**
 * Coarse classification used by clients to decide which types belong in
 * a "new field" menu and which are server-managed.
 *
 *  - primitive: user writes values; this is the default.
 *  - reference: value is a link/lookup into another table; user picks targets.
 *  - computed:  value is derived (formula, rollup); read-only.
 *  - system:    field is set by the runtime (created_at, updated_at); read-only.
 *  - attachment: value is a binary blob managed via attachment APIs.
 */
export type FieldCategory = 'primitive' | 'reference' | 'computed' | 'system' | 'attachment'

// --- manifest ----------------------------------------------------------

/** Validation outcome for one cell value against a field's options. */
export type ValidationResult = { ok: true; value: unknown } | { ok: false; reason: string }

/** Storage descriptor — physical shape of the persisted value. */
export interface StorageDescriptor {
  sqlType: StorageSqlType
  /** Whether a per-cell index on this field type would be meaningful. */
  indexable: boolean
}

/** Operator support declaration. Drives query/sort/aggregate layers. */
export interface OperatorSupport {
  filter: readonly FilterOp[]
  sort: SortMode
  aggregate: readonly AggregateOp[]
}

/** Surface metadata; clients render a "new field" picker from these. */
export interface FieldDisplayMeta {
  displayName: string
  /** A short, human-readable description of the field type. */
  description: string
  /** Optional icon hint — clients map this to their own glyph set. */
  icon?: { emoji?: string; ascii?: string }
}

/**
 * The full manifest. `optionsSchema` and `valueSchema` are zod schemas
 * because they cross the wire and clients may want to validate, but the
 * wire form is JSON Schema (see toJsonShape() if you need to send a
 * manifest over the wire).
 */
export interface FieldTypeManifest<TOptions = unknown> {
  id: FieldType
  /** Bump when the type's semantics change in a breaking way. */
  version: number
  category: FieldCategory
  display: FieldDisplayMeta
  optionsSchema: ZodTypeAny
  valueSchema: ZodTypeAny
  storage: StorageDescriptor
  operators: OperatorSupport
  validate(value: unknown, options: TOptions): ValidationResult
  serialize(value: unknown, options: TOptions): unknown
  defaultValue(options: TOptions): unknown
}

// --- wire shape --------------------------------------------------------

/**
 * What a client sees when it calls `field.types.list`. The functional
 * methods (validate / serialize / defaultValue) are dropped because
 * they can't cross the wire; the client gets descriptive metadata only
 * and runs its own (UI-side) checks if it cares.
 */
export interface FieldTypeManifestWire {
  id: FieldType
  version: number
  category: FieldCategory
  display: FieldDisplayMeta
  storage: StorageDescriptor
  operators: OperatorSupport
  /**
   * options + value schemas serialised to a JSON-Schema-ish object.
   * Intentionally permissive (`unknown`) on the type — clients should
   * not assume a specific JSON Schema dialect; the field is informative,
   * not validation-bearing.
   */
  optionsSchema: unknown
  valueSchema: unknown
}

/**
 * Drop the functional methods + project the schemas to their JSON form
 * so the manifest can travel over the wire.
 */
export function toWireManifest<T>(m: FieldTypeManifest<T>): FieldTypeManifestWire {
  return {
    id: m.id,
    version: m.version,
    category: m.category,
    display: m.display,
    storage: m.storage,
    operators: m.operators,
    // zod 3.x exposes `_def` introspection but not a stable JSON Schema
    // serialiser; for now we ship a placeholder description so clients
    // know the field exists. Replace with zod-to-json-schema when one of
    // the dependents actually needs the structured form.
    optionsSchema: { description: 'see @lattix/shared sources for the zod schema' },
    valueSchema: { description: 'see @lattix/shared sources for the zod schema' },
  }
}
