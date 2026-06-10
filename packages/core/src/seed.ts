import type { IStorage } from './storage/index.js'
import type { FieldRegistry } from '@lattix/shared'

// Seeds the workspace with a sample "Task Tracker" table on first run.
// Idempotent: only runs when there are no tables yet.
export function seedIfEmpty(storage: IStorage, _fields: FieldRegistry): void {
  if (storage.tables.list().length > 0) return

  const table = storage.runInTransaction(() =>
    storage.tables.create({
      name: 'Task Tracker',
      description: 'Track tasks with status, priority, and due dates.',
    }),
  )

  storage.runInTransaction(() => {
    const title = storage.fields.create({
      tableId: table.id,
      name: 'Title',
      type: 'text',
      options: {},
      required: true,
    })
    const status = storage.fields.create({
      tableId: table.id,
      name: 'Status',
      type: 'select',
      options: {
        options: [
          { id: 'todo', name: 'Todo', color: 'gray' },
          { id: 'in_progress', name: 'In Progress', color: 'blue' },
          { id: 'done', name: 'Done', color: 'green' },
        ],
      },
      required: true,
    })
    const priority = storage.fields.create({
      tableId: table.id,
      name: 'Priority',
      type: 'number',
      options: { precision: 0, format: 'integer' },
      required: false,
    })
    const due = storage.fields.create({
      tableId: table.id,
      name: 'Due Date',
      type: 'date',
      options: { includeTime: false, format: 'YYYY-MM-DD' },
      required: false,
    })
    const done = storage.fields.create({
      tableId: table.id,
      name: 'Done',
      type: 'checkbox',
      options: {},
      required: false,
    })

    const samples: Array<Record<string, unknown>> = [
      {
        [title.id]: 'Wire up Core ↔ TUI',
        [status.id]: 'done',
        [priority.id]: 1,
        [due.id]: '2026-06-01',
        [done.id]: true,
      },
      {
        [title.id]: 'Implement FieldRegistry',
        [status.id]: 'done',
        [priority.id]: 1,
        [due.id]: '2026-06-02',
        [done.id]: true,
      },
      {
        [title.id]: 'Grid view + cell editing',
        [status.id]: 'in_progress',
        [priority.id]: 1,
        [due.id]: '2026-06-08',
        [done.id]: false,
      },
      {
        [title.id]: 'CSV import',
        [status.id]: 'todo',
        [priority.id]: 2,
        [due.id]: '2026-06-15',
        [done.id]: false,
      },
      {
        [title.id]: 'Polish first-run experience',
        [status.id]: 'todo',
        [priority.id]: 3,
        [due.id]: null,
        [done.id]: false,
      },
    ]
    for (const row of samples) storage.records.create(table.id, row)
  })
}
