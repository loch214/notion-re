// What Home shows (and the AI's list_tasks / upcoming tools): open tasks and upcoming dated rows
// across all databases. A "task database" is one with a Status (or a "Done" checkbox) column.

import type { Block, DbProperty } from '../src/types'
import { dbRows } from './blocks.ts'
import { addDays, endDay, parseDate, startDay, todayIso } from './dates.ts'

export interface TaskDb {
  db: Block
  status?: DbProperty
  doneCheckbox?: DbProperty
  due?: DbProperty
}

const liveDatabases = (blocks: Record<string, Block>) => Object.values(blocks).filter((b) => b.alive && b.type === 'page' && b.schema)

/** Status options that count as finished: Notion's "Complete" group (here: Done / Complete / last option). */
export function doneOptionIds(status: DbProperty): string[] {
  const opts = status.options ?? []
  const named = opts.filter((o) => /^(done|complete|completed|finished|archived)$/i.test(o.name.trim()))
  return (named.length ? named : opts.slice(-1)).map((o) => o.id)
}

export function taskDatabases(blocks: Record<string, Block>): TaskDb[] {
  const out: TaskDb[] = []
  for (const db of liveDatabases(blocks)) {
    const schema = db.schema!
    const status = schema.find((p) => p.type === 'status')
    const doneCheckbox = status ? undefined : schema.find((p) => p.type === 'checkbox' && /^(done|complete|completed)$/i.test(p.name))
    if (!status && !doneCheckbox) continue
    const dates = schema.filter((p) => p.type === 'date')
    out.push({ db, status, doneCheckbox, due: dates.find((p) => /due|deadline|date|when/i.test(p.name)) ?? dates[0] })
  }
  return out
}

export function isDone(t: TaskDb, row: Block): boolean {
  if (t.status) return doneOptionIds(t.status).includes(String(row.properties.cells?.[t.status.id] ?? ''))
  return !!(t.doneCheckbox && row.properties.cells?.[t.doneCheckbox.id])
}

export interface TaskItem {
  row: Block
  task: TaskDb
  due: string | null
}

/** Open tasks: overdue and dated first (soonest first), then undated, newest first. */
export function openTasks(blocks: Record<string, Block>): TaskItem[] {
  const items: TaskItem[] = []
  for (const t of taskDatabases(blocks)) {
    for (const row of dbRows(blocks, t.db)) {
      if (isDone(t, row)) continue
      items.push({ row, task: t, due: t.due ? (row.properties.cells?.[t.due.id] as string | null) ?? null : null })
    }
  }
  return items.sort((a, b) => {
    const da = startDay(a.due)
    const db = startDay(b.due)
    if (da && db) return da < db ? -1 : da > db ? 1 : 0
    if (da) return -1
    if (db) return 1
    return b.row.created_time - a.row.created_time
  })
}

export interface Upcoming {
  row: Block
  db: Block
  prop: DbProperty
  value: string
  day: string
}

/** Dated rows from every database that start (or are still running) in the next `days` days, by day and time. */
export function upcoming(blocks: Record<string, Block>, days = 14): Upcoming[] {
  const today = todayIso()
  const last = addDays(today, days - 1)
  const out: Upcoming[] = []
  for (const db of liveDatabases(blocks)) {
    const dates = db.schema!.filter((p) => p.type === 'date')
    const tasks = taskDatabases(blocks).find((t) => t.db.id === db.id)
    for (const row of dbRows(blocks, db)) {
      if (tasks && isDone(tasks, row)) continue
      for (const prop of dates) {
        const value = row.properties.cells?.[prop.id]
        const a = startDay(value)
        const b = endDay(value)
        if (!a || !b || b < today || a > last) continue
        out.push({ row, db, prop, value: value as string, day: a < today ? today : a })
      }
    }
  }
  const time = (u: Upcoming) => parseDate(u.value)?.startTime ?? ''
  return out.sort((x, y) => (x.day === y.day ? time(x).localeCompare(time(y)) : x.day < y.day ? -1 : 1))
}
