import {
  TableCreateParamsSchema,
  TableUpdateParamsSchema,
  FieldCreateParamsSchema,
  FieldUpdateParamsSchema,
  FieldReorderParamsSchema,
  RecordCreateParamsSchema,
  RecordUpdateParamsSchema,
  RecordBatchOpSchema,
  RecordBatchParamsSchema,
  RecordImportParamsSchema,
} from '../types.js'

describe('Table schemas', () => {
  it('TableCreateParamsSchema enforces name length', () => {
    expect(TableCreateParamsSchema.safeParse({ name: 'T' }).success).toBe(true)
    expect(TableCreateParamsSchema.safeParse({ name: '' }).success).toBe(false)
    expect(TableCreateParamsSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false)
  })

  it('TableCreateParamsSchema allows nullable description', () => {
    expect(TableCreateParamsSchema.safeParse({ name: 'T', description: null }).success).toBe(true)
    expect(TableCreateParamsSchema.safeParse({ name: 'T', description: 'd' }).success).toBe(true)
  })

  it('TableCreateParamsSchema rejects extra keys (strict)', () => {
    expect(TableCreateParamsSchema.safeParse({ name: 'T', extra: 1 }).success).toBe(false)
  })

  it('TableUpdateParamsSchema requires tableId', () => {
    expect(TableUpdateParamsSchema.safeParse({ tableId: 't', name: 'N' }).success).toBe(true)
    expect(TableUpdateParamsSchema.safeParse({ name: 'N' }).success).toBe(false)
  })
})

describe('Field schemas', () => {
  it('FieldCreateParamsSchema enforces enum types and defaults', () => {
    const ok = FieldCreateParamsSchema.safeParse({
      tableId: 't',
      name: 'A',
      type: 'text',
    })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data.options).toEqual({})
      expect(ok.data.required).toBe(false)
    }
    expect(
      FieldCreateParamsSchema.safeParse({ tableId: 't', name: 'A', type: 'blob' }).success,
    ).toBe(false)
  })

  it('FieldUpdateParamsSchema needs fieldId, all else optional', () => {
    expect(FieldUpdateParamsSchema.safeParse({ fieldId: 'f' }).success).toBe(true)
    expect(FieldUpdateParamsSchema.safeParse({}).success).toBe(false)
  })

  it('FieldReorderParamsSchema accepts an array (incl. empty)', () => {
    expect(FieldReorderParamsSchema.safeParse({ tableId: 't', order: [] }).success).toBe(true)
    expect(FieldReorderParamsSchema.safeParse({ tableId: 't', order: ['a', 'b'] }).success).toBe(
      true,
    )
    expect(FieldReorderParamsSchema.safeParse({ tableId: 't', order: [''] }).success).toBe(false)
  })
})

describe('Record schemas', () => {
  it('RecordCreate/UpdateParamsSchema require ids and data', () => {
    expect(RecordCreateParamsSchema.safeParse({ tableId: 't', data: {} }).success).toBe(true)
    expect(RecordCreateParamsSchema.safeParse({ tableId: 't' }).success).toBe(false)
    expect(
      RecordUpdateParamsSchema.safeParse({ tableId: 't', recordId: 'r', data: { a: 1 } }).success,
    ).toBe(true)
    expect(RecordUpdateParamsSchema.safeParse({ tableId: 't', data: {} }).success).toBe(false)
  })

  it('RecordBatchOpSchema discriminates by op', () => {
    expect(RecordBatchOpSchema.safeParse({ op: 'create', data: {} }).success).toBe(true)
    expect(RecordBatchOpSchema.safeParse({ op: 'update', recordId: 'r', data: {} }).success).toBe(
      true,
    )
    expect(RecordBatchOpSchema.safeParse({ op: 'delete', recordId: 'r' }).success).toBe(true)
    expect(RecordBatchOpSchema.safeParse({ op: 'patch', data: {} }).success).toBe(false)
  })

  it('RecordBatchParamsSchema enforces operations bounds', () => {
    expect(
      RecordBatchParamsSchema.safeParse({
        tableId: 't',
        operations: [{ op: 'create', data: {} }],
      }).success,
    ).toBe(true)
    expect(RecordBatchParamsSchema.safeParse({ tableId: 't', operations: [] }).success).toBe(false)
  })

  it('RecordImportParamsSchema requires ≥1 row', () => {
    expect(RecordImportParamsSchema.safeParse({ tableId: 't', rows: [{ a: 1 }] }).success).toBe(
      true,
    )
    expect(RecordImportParamsSchema.safeParse({ tableId: 't', rows: [] }).success).toBe(false)
  })
})
