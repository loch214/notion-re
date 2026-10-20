// Templates: the starter gallery (sidebar → Templates, `/` menu, AI) and database templates
// ("New" ▾ in a database). Shared by the app and the MCP server; all builders mutate a blocks map.
// The gallery content is our own, modelled on the kinds of templates Notion offers for personal use.

import type { Block, CellValue, DbProperty, DbView, OptionColor, PropertyType } from '../src/types'
import { dbTemplates, duplicateTree, insertSpecs, makeBlock, markdownToBlocks, shortId } from './blocks.ts'
import { addDays, todayIso } from './dates.ts'
import { newView } from './views.ts'

type Value = string | number | boolean | string[]

/** A template's date cell that means "the day a page is made from it". */
export const TODAY = '@today'

interface TplColumn {
  name: string
  type: Exclude<PropertyType, 'title'>
  options?: [string, OptionColor][]
  date_format?: DbProperty['date_format']
}

interface TplView {
  name: string
  type: DbView['type']
  group_by?: string
  calendar_by?: string
  filters?: { column: string; operator: DbView['filter']['filters'][number]['operator']; value?: Value }[]
  sort?: { column: string; direction: 'ascending' | 'descending' }[]
  hidden?: string[]
}

interface TplRow {
  title: string
  icon?: string
  /** Dates may be "+N" / "-N" (days from today) or "+N/+M" for a range. */
  values?: Record<string, Value>
  body?: string
}

interface TplDatabase {
  title_column?: string
  columns: TplColumn[]
  views: TplView[]
  rows?: TplRow[]
  /** Database templates; the first one becomes the default. */
  templates?: TplRow[]
}

export interface Template {
  key: string
  name: string
  icon: string
  category: 'Personal' | 'Work' | 'Planning'
  description: string
  cover?: string
  /** Markdown body of the page (above the database, for database templates). */
  body?: string
  database?: TplDatabase
}

const STATUS: [string, OptionColor][] = [['Not started', 'default'], ['In progress', 'blue'], ['Done', 'green']]
const PRIORITY: [string, OptionColor][] = [['Low', 'green'], ['Medium', 'yellow'], ['High', 'red']]

export const TEMPLATES: Template[] = [
  {
    key: 'tasks',
    name: 'Tasks tracker',
    icon: '✅',
    category: 'Planning',
    description: 'Track tasks by status, due date and priority. Shows up on Home under My tasks.',
    database: {
      title_column: 'Task name',
      columns: [
        { name: 'Status', type: 'status', options: STATUS },
        { name: 'Due date', type: 'date' },
        { name: 'Priority', type: 'select', options: PRIORITY },
        { name: 'Tags', type: 'multi_select', options: [['Personal', 'purple'], ['Work', 'blue'], ['Errand', 'orange']] },
      ],
      views: [
        { name: 'All tasks', type: 'table', sort: [{ column: 'Due date', direction: 'ascending' }] },
        { name: 'By status', type: 'board', group_by: 'Status' },
        { name: 'Due this week', type: 'list', filters: [{ column: 'Due date', operator: 'date_is_within', value: 'this_week' }, { column: 'Status', operator: 'enum_is_not', value: 'Done' }], sort: [{ column: 'Due date', direction: 'ascending' }] },
        { name: 'Calendar', type: 'calendar', calendar_by: 'Due date' },
      ],
      rows: [
        { title: 'Plan the week', values: { Status: 'In progress', 'Due date': '+0', Priority: 'High', Tags: ['Personal'] } },
        { title: 'Reply to emails', values: { Status: 'Not started', 'Due date': '+1', Priority: 'Medium', Tags: ['Work'] } },
        { title: 'Buy groceries', values: { Status: 'Not started', 'Due date': '+2', Priority: 'Low', Tags: ['Errand'] } },
        { title: 'Set up Notion(RE)', values: { Status: 'Done', 'Due date': '-1', Priority: 'Medium', Tags: ['Personal'] } },
      ],
      templates: [{ title: 'New task', icon: '✅', values: { Status: 'Not started', Priority: 'Medium' }, body: '## Notes\n\n## Checklist\n- [ ] ' }],
    },
  },
  {
    key: 'todo',
    name: 'To-do list',
    icon: '☑️',
    category: 'Personal',
    description: 'A simple checklist page: today, this week, later.',
    body: '## Today\n- [ ] First thing to do\n- [ ] Second thing\n## This week\n- [ ] Something for this week\n## Later\n- [ ] Someday',
  },
  {
    key: 'journal',
    name: 'Journal',
    icon: '📔',
    category: 'Personal',
    description: 'One page per day, with tags and the date it was written.',
    database: {
      columns: [
        { name: 'Date', type: 'date' },
        { name: 'Tags', type: 'multi_select', options: [['Personal', 'purple'], ['Work', 'blue'], ['Ideas', 'yellow'], ['Gratitude', 'green']] },
      ],
      views: [
        { name: 'All entries', type: 'table', sort: [{ column: 'Date', direction: 'descending' }] },
        { name: 'Calendar', type: 'calendar', calendar_by: 'Date' },
      ],
      rows: [{ title: 'First entry', icon: '✍️', values: { Date: '+0', Tags: ['Personal'] }, body: 'Today I started my journal.' }],
      templates: [{ title: 'Daily entry', icon: '✍️', values: { Date: '+0' }, body: '## How was today?\n\n## Grateful for\n- \n## Tomorrow\n- [ ] ' }],
    },
  },
  {
    key: 'reading',
    name: 'Reading list',
    icon: '📚',
    category: 'Personal',
    description: 'Books, articles and podcasts to read, with status and rating.',
    database: {
      columns: [
        { name: 'Status', type: 'status', options: [['To read', 'default'], ['Reading', 'blue'], ['Finished', 'green']] },
        { name: 'Type', type: 'select', options: [['Book', 'brown'], ['Article', 'blue'], ['Podcast', 'purple']] },
        { name: 'Author', type: 'text' },
        { name: 'Rating', type: 'select', options: [['⭐', 'default'], ['⭐⭐', 'default'], ['⭐⭐⭐', 'default'], ['⭐⭐⭐⭐', 'default'], ['⭐⭐⭐⭐⭐', 'default']] },
        { name: 'Link', type: 'url' },
      ],
      views: [
        { name: 'By status', type: 'board', group_by: 'Status' },
        { name: 'All', type: 'table' },
        { name: 'Gallery', type: 'gallery' },
      ],
      rows: [
        { title: 'Example book', icon: '📕', values: { Status: 'Reading', Type: 'Book', Author: 'Someone' } },
        { title: 'Example article', icon: '📰', values: { Status: 'To read', Type: 'Article' } },
      ],
    },
  },
  {
    key: 'meetings',
    name: 'Meeting notes',
    icon: '🗓️',
    category: 'Work',
    description: 'Notes for each meeting with date, type, agenda and action items.',
    database: {
      columns: [
        { name: 'Date', type: 'date' },
        { name: 'Type', type: 'select', options: [['Standup', 'blue'], ['1:1', 'purple'], ['Planning', 'orange'], ['Review', 'green']] },
        { name: 'Attendees', type: 'text' },
      ],
      views: [
        { name: 'All meetings', type: 'table', sort: [{ column: 'Date', direction: 'descending' }] },
        { name: 'Calendar', type: 'calendar', calendar_by: 'Date' },
      ],
      templates: [{ title: 'Meeting', icon: '🗓️', values: { Date: '+0' }, body: '## Agenda\n- \n## Notes\n\n## Action items\n- [ ] ' }],
    },
  },
  {
    key: 'projects',
    name: 'Projects',
    icon: '🚀',
    category: 'Work',
    description: 'Projects with status, priority and start / end dates.',
    database: {
      title_column: 'Project name',
      columns: [
        { name: 'Status', type: 'status', options: [['Planning', 'default'], ['In progress', 'blue'], ['Paused', 'orange'], ['Done', 'green']] },
        { name: 'Priority', type: 'select', options: PRIORITY },
        { name: 'Dates', type: 'date' },
      ],
      views: [
        { name: 'Board', type: 'board', group_by: 'Status' },
        { name: 'All projects', type: 'table' },
        { name: 'Calendar', type: 'calendar', calendar_by: 'Dates' },
      ],
      rows: [{ title: 'Example project', icon: '🚀', values: { Status: 'In progress', Priority: 'High', Dates: '+0/+14' }, body: '## Goal\n\n## Milestones\n- [ ] ' }],
      templates: [{ title: 'Project', icon: '🚀', values: { Status: 'Planning' }, body: '## Goal\n\n## Milestones\n- [ ] \n## Notes' }],
    },
  },
  {
    key: 'weekly',
    name: 'Weekly planner',
    icon: '📅',
    category: 'Planning',
    description: 'Plan the week day by day with to-dos in columns.',
    body: '## Goals for the week\n- [ ] \n## Monday\n- [ ] \n## Tuesday\n- [ ] \n## Wednesday\n- [ ] \n## Thursday\n- [ ] \n## Friday\n- [ ] \n## Weekend\n- [ ] ',
  },
]

function dateValue(v: Value): CellValue {
  const one = (s: string) => (/^[+-]\d+$/.test(s) ? addDays(todayIso(), Number(s)) : s)
  return String(v).split('/').map(one).join('/')
}

function cellFor(prop: DbProperty, v: Value): CellValue {
  const opt = (name: string) => prop.options?.find((o) => o.name === name)?.id ?? null
  switch (prop.type) {
    case 'select':
    case 'status': return opt(String(v))
    case 'multi_select': return (Array.isArray(v) ? v : [String(v)]).map(opt).filter((x): x is string => !!x)
    case 'date': return dateValue(v)
    default: return v as CellValue
  }
}

function addPage(blocks: Record<string, Block>, parent: string, row: TplRow, schema: DbProperty[], template = false): string {
  const p = makeBlock('page', parent, row.title)
  if (row.icon) p.format.icon = row.icon
  if (template) p.format.template = true
  const cells: Record<string, CellValue> = {}
  for (const [name, v] of Object.entries(row.values ?? {})) {
    const prop = schema.find((x) => x.name === name)
    if (prop) cells[prop.id] = template && prop.type === 'date' && v === '+0' ? TODAY : cellFor(prop, v)
  }
  if (Object.keys(cells).length) p.properties.cells = cells
  blocks[p.id] = p
  blocks[parent] = { ...blocks[parent], content: [...blocks[parent].content, p.id] }
  if (row.body) insertSpecs(blocks, p.id, markdownToBlocks(row.body))
  return p.id
}

/** Creates the template's page (and database) under `parentId` (null = top level). Returns the new page id. */
export function buildTemplate(blocks: Record<string, Block>, tpl: Template, parentId: string | null): string {
  const page = makeBlock('page', parentId, tpl.name)
  page.format.icon = tpl.icon
  if (tpl.cover) page.format.cover = tpl.cover
  blocks[page.id] = page
  if (parentId) blocks[parentId] = { ...blocks[parentId], content: [...blocks[parentId].content, page.id], last_edited_time: Date.now() }
  const d = tpl.database
  if (!d) {
    if (tpl.body) insertSpecs(blocks, page.id, markdownToBlocks(tpl.body))
    return page.id
  }
  // A full-page database, like Notion's database templates.
  const schema: DbProperty[] = [{ id: 'title', name: d.title_column ?? 'Name', type: 'title' }]
  for (const c of d.columns) {
    const prop: DbProperty = { id: shortId(), name: c.name, type: c.type }
    if (c.options) prop.options = c.options.map(([name, color]) => ({ id: shortId(), name, color }))
    if (c.date_format) prop.date_format = c.date_format
    schema.push(prop)
  }
  const col = (name: string) => schema.find((p) => p.name === name)!
  const views: DbView[] = d.views.map((v) => {
    const view = newView(v.type, schema, v.name)
    if (v.group_by) view.group_by = col(v.group_by).id
    if (v.calendar_by) view.calendar_by = col(v.calendar_by).id
    if (v.filters) {
      view.filter.filters = v.filters.map((f) => {
        const prop = col(f.column)
        const value = f.value === undefined ? undefined : f.operator === 'date_is_within' ? String(f.value) : cellFor(prop, f.value)
        return { property: prop.id, operator: f.operator, value: Array.isArray(value) ? value[0] : value }
      })
    }
    if (v.sort) view.sort = v.sort.map((s) => ({ property: col(s.column).id, direction: s.direction }))
    if (v.hidden) view.hidden = v.hidden.map((n) => col(n).id)
    return view
  })
  blocks[page.id] = { ...page, schema, views }
  if (tpl.body) insertSpecs(blocks, page.id, markdownToBlocks(tpl.body))
  for (const r of d.rows ?? []) addPage(blocks, page.id, r, schema)
  const tplIds = (d.templates ?? []).map((t) => addPage(blocks, page.id, t, schema, true))
  if (tplIds[0]) blocks[page.id] = { ...blocks[page.id], format: { ...blocks[page.id].format, default_template: tplIds[0] } }
  return page.id
}

export const findTemplate = (key: string) =>
  TEMPLATES.find((t) => t.key === key || t.name.toLowerCase() === key.toLowerCase().trim())

// ── Database templates ("New" ▾) ──

/** Adds an empty template page to a database. Returns its id. */
export function addDbTemplate(blocks: Record<string, Block>, dbId: string, title = 'New template'): string {
  return addPage(blocks, dbId, { title }, blocks[dbId].schema ?? [], true)
}

/**
 * A new row made from a template: copies its title, icon, cover, property values and content
 * (Notion's "New page from template"). Without a template it's an empty row.
 */
export function rowFromTemplate(blocks: Record<string, Block>, dbId: string, templateId: string | null, cells?: Record<string, CellValue>): string {
  const db = blocks[dbId]
  const tpl = templateId ? dbTemplates(blocks, db).find((t) => t.id === templateId) : undefined
  let id: string
  if (tpl) {
    id = duplicateTree(blocks, tpl.id, dbId)
    const row = blocks[id]
    row.format = { ...row.format, template: undefined }
    // Notion's "Today" in a template date becomes the day the page is made.
    const copied = Object.fromEntries(Object.entries(row.properties.cells ?? {}).map(([k, v]) => [k, v === TODAY ? todayIso() : v]))
    row.properties = { ...row.properties, cells: { ...copied, ...cells } }
  } else {
    const row = makeBlock('page', dbId)
    if (cells && Object.keys(cells).length) row.properties.cells = { ...cells }
    blocks[row.id] = row
    id = row.id
  }
  blocks[dbId] = { ...blocks[dbId], content: [...blocks[dbId].content, id], last_edited_time: Date.now() }
  return id
}
