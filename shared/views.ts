// Database views: filters, sorts and grouping, shared by the app and the MCP server.
// Modelled on Notion's collection views (analysis/databases.md), our own implementation.

import type { Block, CellValue, DbFilter, DbProperty, DbView, FilterOperator, PropertyType, ViewType } from '../src/types'
import { cellRaw, cellText, dbRows, isSingleChoice, shortId } from './blocks.ts'

export const VIEW_TYPES: { type: ViewType; label: string; icon: string }[] = [
  { type: 'table', label: 'Table', icon: '▦' },
  { type: 'board', label: 'Board', icon: '▥' },
  { type: 'list', label: 'List', icon: '☰' },
  { type: 'gallery', label: 'Gallery', icon: '▩' },
  { type: 'calendar', label: 'Calendar', icon: '📅' },
]

export function newView(type: ViewType, schema: DbProperty[], name?: string): DbView {
  const view: DbView = {
    id: shortId(),
    name: name ?? VIEW_TYPES.find((v) => v.type === type)!.label,
    type,
    sort: [],
    filter: { operator: 'and', filters: [] },
  }
  if (type === 'board') view.group_by = schema.find((p) => isSingleChoice(p.type))?.id
  if (type === 'calendar') view.calendar_by = schema.find((p) => p.type === 'date')?.id
  if (type === 'gallery') view.cover = 'page_content'
  return view
}

/** A database's views; databases made before views existed get one default table. */
export function getViews(db: Block): DbView[] {
  return db.views?.length ? db.views : [{ id: 'default', name: 'Table', type: 'table', sort: [], filter: { operator: 'and', filters: [] } }]
}

/** Filter conditions offered for each property type, with plain-language labels. */
export const OPERATORS: Record<PropertyType, { op: FilterOperator; label: string }[]> = {
  title: [
    { op: 'string_contains', label: 'contains' },
    { op: 'string_is', label: 'is' },
    { op: 'string_starts_with', label: 'starts with' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
  text: [],
  url: [],
  number: [
    { op: 'number_equals', label: '=' },
    { op: 'number_greater_than', label: '>' },
    { op: 'number_less_than', label: '<' },
    { op: 'number_greater_than_or_equal_to', label: '≥' },
    { op: 'number_less_than_or_equal_to', label: '≤' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
  select: [
    { op: 'enum_is', label: 'is' },
    { op: 'enum_is_not', label: 'is not' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
  multi_select: [
    { op: 'enum_contains', label: 'contains' },
    { op: 'enum_does_not_contain', label: 'does not contain' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
  status: [],
  created_time: [],
  last_edited_time: [],
  checkbox: [{ op: 'checkbox_is', label: 'is' }],
  date: [
    { op: 'date_is', label: 'is' },
    { op: 'date_is_on_or_before', label: 'is on or before' },
    { op: 'date_is_on_or_after', label: 'is on or after' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
}
OPERATORS.text = OPERATORS.title
OPERATORS.status = OPERATORS.select
OPERATORS.created_time = OPERATORS.date
OPERATORS.last_edited_time = OPERATORS.date
OPERATORS.url = OPERATORS.title

export const needsValue = (op: FilterOperator) => op !== 'is_empty' && op !== 'is_not_empty'

function rawValue(prop: DbProperty, row: Block): CellValue {
  return cellRaw(prop, row)
}

const isEmpty = (v: CellValue) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

/** Does one row pass one filter rule? Rules on deleted properties are ignored. */
export function matchFilter(schema: DbProperty[], row: Block, f: DbFilter): boolean {
  const prop = schema.find((p) => p.id === f.property)
  if (!prop) return true
  const v = rawValue(prop, row)
  const text = cellText(prop, row).toLowerCase()
  const want = f.value
  switch (f.operator) {
    case 'is_empty': return prop.type === 'checkbox' ? !v : isEmpty(v)
    case 'is_not_empty': return prop.type === 'checkbox' ? !!v : !isEmpty(v)
    case 'string_is': return text === String(want ?? '').toLowerCase()
    case 'string_contains': return text.includes(String(want ?? '').toLowerCase())
    case 'string_starts_with': return text.startsWith(String(want ?? '').toLowerCase())
    case 'number_equals': return typeof v === 'number' && v === Number(want)
    case 'number_greater_than': return typeof v === 'number' && v > Number(want)
    case 'number_less_than': return typeof v === 'number' && v < Number(want)
    case 'number_greater_than_or_equal_to': return typeof v === 'number' && v >= Number(want)
    case 'number_less_than_or_equal_to': return typeof v === 'number' && v <= Number(want)
    case 'enum_is': return v === want
    case 'enum_is_not': return v !== want
    case 'enum_contains': return Array.isArray(v) && v.includes(String(want))
    case 'enum_does_not_contain': return !Array.isArray(v) || !v.includes(String(want))
    case 'checkbox_is': return !!v === !!want
    case 'date_is': return v === want
    case 'date_is_on_or_before': return typeof v === 'string' && !!want && v <= String(want)
    case 'date_is_on_or_after': return typeof v === 'string' && !!want && v >= String(want)
    default: return true
  }
}

function compare(prop: DbProperty, a: Block, b: Block): number {
  const va = rawValue(prop, a)
  const vb = rawValue(prop, b)
  // Empty values go last, like Notion.
  if (isEmpty(va) && isEmpty(vb)) return 0
  if (isEmpty(va)) return 1
  if (isEmpty(vb)) return -1
  if (prop.type === 'number') return (va as number) - (vb as number)
  if (prop.type === 'checkbox') return Number(!!va) - Number(!!vb)
  if (isSingleChoice(prop.type)) {
    // Options sort in their defined order.
    const order = (id: CellValue) => prop.options?.findIndex((o) => o.id === id) ?? 0
    return order(va) - order(vb)
  }
  return cellText(prop, a).localeCompare(cellText(prop, b), undefined, { numeric: true, sensitivity: 'base' })
}

/** The rows a view shows, filtered and sorted. */
export function applyView(blocks: Record<string, Block>, db: Block, view: DbView): Block[] {
  const schema = db.schema ?? []
  let rows = dbRows(blocks, db)
  const rules = view.filter.filters
  if (rules.length) {
    rows = rows.filter((r) =>
      view.filter.operator === 'or' ? rules.some((f) => matchFilter(schema, r, f)) : rules.every((f) => matchFilter(schema, r, f)),
    )
  }
  const sorts = view.sort.map((s) => ({ s, prop: schema.find((p) => p.id === s.property) })).filter((x) => x.prop)
  if (sorts.length) {
    rows = [...rows].sort((a, b) => {
      for (const { s, prop } of sorts) {
        const c = compare(prop!, a, b)
        if (c) return s.direction === 'descending' ? -c : c
      }
      return 0
    })
  }
  return rows
}

/**
 * Cell values a new row should start with so it shows up in this view (Notion pre-fills from
 * "is" filters), plus any extra values (e.g. the board column or calendar day it was added to).
 */
export function prefillFor(view: DbView): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {}
  if (view.filter.operator !== 'and') return cells
  for (const f of view.filter.filters) {
    if (f.operator === 'enum_is' || f.operator === 'checkbox_is' || f.operator === 'date_is') cells[f.property] = f.value ?? null
    if (f.operator === 'enum_contains' && f.value) cells[f.property] = [String(f.value)]
  }
  return cells
}

/** Board columns: one per option of the group-by property, plus "No <property>" first. */
export function boardGroups(db: Block, view: DbView, rows: Block[]) {
  const prop = db.schema?.find((p) => p.id === view.group_by && isSingleChoice(p.type))
  if (!prop) return null
  const groups = [
    { id: null as string | null, label: `No ${prop.name}`, color: 'default' as const, rows: [] as Block[] },
    ...(prop.options ?? []).map((o) => ({ id: o.id as string | null, label: o.name, color: o.color, rows: [] as Block[] })),
  ]
  for (const r of rows) {
    const v = cellRaw(prop, r)
    ;(groups.find((g) => g.id === (typeof v === 'string' ? v : null)) ?? groups[0]).rows.push(r)
  }
  return { prop, groups }
}

/** Plain-language summary of a view, for the AI. */
export function describeView(db: Block, view: DbView): string {
  const schema = db.schema ?? []
  const name = (id?: string) => schema.find((p) => p.id === id)?.name ?? '(missing column)'
  const label = (f: DbFilter) => {
    const prop = schema.find((p) => p.id === f.property)
    const op = prop ? OPERATORS[prop.type].find((o) => o.op === f.operator)?.label ?? f.operator : f.operator
    const value = !needsValue(f.operator)
      ? ''
      : (prop && isSingleChoice(prop.type)) || prop?.type === 'multi_select'
        ? ` "${prop.options?.find((o) => o.id === f.value)?.name ?? f.value}"`
        : ` ${JSON.stringify(f.value)}`
    return `${name(f.property)} ${op}${value}`
  }
  const parts = [`${view.name} (${view.type})`]
  if (view.group_by) parts.push(`grouped by ${name(view.group_by)}`)
  if (view.calendar_by) parts.push(`by date ${name(view.calendar_by)}`)
  if (view.filter.filters.length) parts.push(`filter: ${view.filter.filters.map(label).join(view.filter.operator === 'or' ? ' OR ' : ' AND ')}`)
  if (view.sort.length) parts.push(`sort: ${view.sort.map((s) => `${name(s.property)} ${s.direction}`).join(', ')}`)
  if (view.hidden?.length) parts.push(`hidden: ${view.hidden.map(name).join(', ')}`)
  return parts.join(' · ')
}
