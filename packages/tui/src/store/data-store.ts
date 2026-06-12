import type { LattixConnection, LattixClient } from '@lattix/client'
import { createClient } from '@lattix/client'
import type { Table, Field, RecordRow } from '@lattix/shared'
import { recordsChannel } from '@lattix/protocol'

export interface TableState {
  table: Table
  fields: Field[]
  records: RecordRow[]
  total: number
  loading: boolean
  error: string | null
}

export class DataStore {
  private readonly listeners = new Set<() => void>()
  private tables: Table[] = []
  private currentTableId: string | null = null
  private readonly tableStates = new Map<string, TableState>()
  private subs = new Map<string, () => void>()

  private readonly conn: LattixConnection
  private readonly client: LattixClient

  constructor(conn: LattixConnection) {
    this.conn = conn
    this.client = createClient(conn)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  getTables(): readonly Table[] {
    return this.tables
  }

  getCurrentTableId(): string | null {
    return this.currentTableId
  }

  getCurrentTable(): Table | null {
    if (!this.currentTableId) return null
    return this.tables.find((t) => t.id === this.currentTableId) ?? null
  }

  getTableState(tableId: string): TableState | null {
    return this.tableStates.get(tableId) ?? null
  }

  async loadTables(): Promise<void> {
    const { tables } = await this.client.tables.list({})
    this.tables = tables as Table[]
    if (!this.currentTableId && this.tables[0]) {
      await this.selectTable(this.tables[0].id)
    }
    this.emit()
  }

  async selectTable(tableId: string): Promise<void> {
    if (this.currentTableId === tableId) return
    if (this.currentTableId) this.unsubTable(this.currentTableId)
    this.currentTableId = tableId
    const table = this.tables.find((t) => t.id === tableId)
    if (!table) return
    const state: TableState = {
      table,
      fields: [],
      records: [],
      total: 0,
      loading: true,
      error: null,
    }
    this.tableStates.set(tableId, state)
    this.emit()
    await this.loadTableData(tableId)
    const unsub = await this.conn.subscribe(recordsChannel(tableId), () => {
      void this.loadTableData(tableId)
    })
    this.subs.set(tableId, unsub)
  }

  private unsubTable(tableId: string): void {
    const u = this.subs.get(tableId)
    if (u) {
      u()
      this.subs.delete(tableId)
    }
  }

  private async loadTableData(tableId: string): Promise<void> {
    const state = this.tableStates.get(tableId)
    if (!state) return
    try {
      const [{ fields }, { records, total }] = await Promise.all([
        this.client.fields.list({ tableId }),
        this.client.records.list({ tableId, limit: 1000 }),
      ])
      this.tableStates.set(tableId, {
        ...state,
        fields: fields as Field[],
        records: records as RecordRow[],
        total,
        loading: false,
        error: null,
      })
    } catch (err) {
      this.tableStates.set(tableId, {
        ...state,
        loading: false,
        error: (err as Error).message,
      })
    }
    this.emit()
  }

  async createTable(name: string, description?: string): Promise<Table> {
    const { table } = await this.client.tables.create({
      name,
      description: description ?? null,
    })
    const t = table as Table
    this.tables = [...this.tables, t]
    if (!this.currentTableId) await this.selectTable(t.id)
    else this.emit()
    return t
  }

  async deleteTable(tableId: string): Promise<void> {
    await this.client.tables.delete({ tableId })
    this.tableStates.delete(tableId)
    this.unsubTable(tableId)
    this.tables = this.tables.filter((t) => t.id !== tableId)
    if (this.currentTableId === tableId) {
      this.currentTableId = this.tables[0]?.id ?? null
      if (this.currentTableId) await this.selectTable(this.currentTableId)
    }
    this.emit()
  }

  async createField(input: {
    tableId: string
    name: string
    type: Field['type']
    options?: Record<string, unknown>
    required?: boolean
  }): Promise<Field> {
    const { field } = await this.client.fields.create(input)
    await this.loadTableData(input.tableId)
    return field as Field
  }

  async updateRecord(input: {
    tableId: string
    recordId: string
    fieldId: string
    value: unknown
  }): Promise<void> {
    await this.client.records.update({
      tableId: input.tableId,
      recordId: input.recordId,
      data: { [input.fieldId]: input.value },
    })
    const state = this.tableStates.get(input.tableId)
    if (state) {
      this.tableStates.set(input.tableId, {
        ...state,
        records: state.records.map((r) =>
          r.id === input.recordId ? { ...r, data: { ...r.data, [input.fieldId]: input.value } } : r,
        ),
      })
      this.emit()
    }
  }

  async createRecord(tableId: string): Promise<RecordRow> {
    const { record } = await this.client.records.create({ tableId, data: {} })
    await this.loadTableData(tableId)
    return record as RecordRow
  }

  async deleteRecord(tableId: string, recordId: string): Promise<void> {
    await this.client.records.delete({ tableId, recordId })
    await this.loadTableData(tableId)
  }
  async dispose(): Promise<void> {
    for (const u of this.subs.values()) u()
    this.subs.clear()
  }
}
