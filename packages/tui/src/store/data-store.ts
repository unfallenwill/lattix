import type { LattixConnection } from '@lattix/client'
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

  constructor(conn: LattixConnection) {
    this.conn = conn
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
    const res = (await this.conn.request('table.list')) as { tables: Table[] }
    this.tables = res.tables
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
      const [fieldsRes, recordsRes] = await Promise.all([
        this.conn.request('field.list', { tableId }),
        this.conn.request('record.list', { tableId, limit: 1000 }),
      ])
      const fields = (fieldsRes as { fields: Field[] }).fields
      const records = (recordsRes as { records: RecordRow[]; total: number }).records
      const total = (recordsRes as { records: RecordRow[]; total: number }).total
      this.tableStates.set(tableId, {
        ...state,
        fields,
        records,
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
    const res = (await this.conn.request('table.create', {
      name,
      description: description ?? null,
    })) as { table: Table }
    this.tables = [...this.tables, res.table]
    if (!this.currentTableId) await this.selectTable(res.table.id)
    else this.emit()
    return res.table
  }

  async deleteTable(tableId: string): Promise<void> {
    await this.conn.request('table.delete', { tableId })
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
    const res = (await this.conn.request('field.create', input)) as { field: Field }
    await this.loadTableData(input.tableId)
    return res.field
  }

  async updateRecord(input: {
    tableId: string
    recordId: string
    fieldId: string
    value: unknown
  }): Promise<void> {
    await this.conn.request('record.update', {
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
    const res = (await this.conn.request('record.create', {
      tableId,
      data: {},
    })) as { record: RecordRow }
    await this.loadTableData(tableId)
    return res.record
  }

  async deleteRecord(tableId: string, recordId: string): Promise<void> {
    await this.conn.request('record.delete', { tableId, recordId })
    await this.loadTableData(tableId)
  }
  async dispose(): Promise<void> {
    for (const u of this.subs.values()) u()
    this.subs.clear()
  }
}
