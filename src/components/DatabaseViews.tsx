// Database views: tabs (table / board / list / gallery / calendar), filter and sort controls,
// and the non-table layouts. Modelled on Notion's collection views (analysis/databases.md).

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { coverCss, htmlToPlain, shortId } from '../../shared/blocks.ts'
import { applyView, boardGroups, getViews, needsValue, newView, OPERATORS, prefillFor, VIEW_TYPES } from '../../shared/views.ts'
import { pageTitle, useStore } from '../store'
import type { Block, CellValue, DbFilter, DbProperty, DbView, FilterOperator } from '../types'
import { Cell, Pill, Popover, TableBody, TYPE_ICON } from './Database'

const S = useStore.getState

/** Change one view; the first edit turns the implicit default view into a saved one. */
function updateView(db: Block, viewId: string, patch: Partial<DbView> | null) {
  const views = getViews(db)
  const next = patch === null ? views.filter((v) => v.id !== viewId) : views.map((v) => (v.id === viewId ? { ...v, ...patch } : v))
  S().updateBlock(db.id, { views: next })
}

function viewKey(dbId: string) {
  return `notion-re:view:${dbId}`
}

export function DatabaseView({ dbId }: { dbId: string }) {
  const db = useStore((s) => s.blocks[dbId])
  const blocks = useStore((s) => s.blocks)
  const [activeId, setActiveId] = useState(() => localStorage.getItem(viewKey(dbId)) ?? '')
  const [menu, setMenu] = useState<{ kind: 'view' | 'add' | 'filter' | 'sort'; rect: DOMRect } | null>(null)

  useEffect(() => {
    if (activeId) localStorage.setItem(viewKey(dbId), activeId)
  }, [activeId, dbId])

  const views = db?.schema ? getViews(db) : []
  const view = views.find((v) => v.id === activeId) ?? views[0]
  const rows = useMemo(() => (db?.schema && view ? applyView(blocks, db, view) : []), [blocks, db, view])
  if (!db?.schema || !view) return null

  /** New row that shows up in this view, optionally with extra values (board column, calendar day). */
  const newRow = (cells: Record<string, CellValue> = {}) => {
    let id = ''
    S().transact(() => {
      id = S().addRow(db.id, '', { ...prefillFor(view), ...cells })
    })
    return id
  }

  const open = (kind: 'view' | 'add' | 'filter' | 'sort') => (e: React.MouseEvent<HTMLElement>) =>
    setMenu({ kind, rect: e.currentTarget.getBoundingClientRect() })

  return (
    <div className="db">
      <div className="db-views">
        {views.map((v) => (
          <button
            key={v.id}
            className={`db-view-tab ${v.id === view.id ? 'active' : ''}`}
            onClick={(e) => (v.id === view.id ? open('view')(e) : setActiveId(v.id))}
            title={v.id === view.id ? 'View options' : undefined}
          >
            {VIEW_TYPES.find((t) => t.type === v.type)?.icon} {v.name}
          </button>
        ))}
        <button className="db-view-tab" title="Add a view" onClick={open('add')}>＋</button>
        <span style={{ flex: 1 }} />
        <button className={`db-tool ${view.filter.filters.length ? 'on' : ''}`} onClick={open('filter')}>
          Filter{view.filter.filters.length ? ` · ${view.filter.filters.length}` : ''}
        </button>
        <button className={`db-tool ${view.sort.length ? 'on' : ''}`} onClick={open('sort')}>
          Sort{view.sort.length ? ` · ${view.sort.length}` : ''}
        </button>
        <button className="btn primary small" onClick={() => S().openPage(newRow())}>New</button>
      </div>

      {view.type === 'table' && <TableBody db={db} rows={rows} view={view} onNewRow={() => newRow()} />}
      {view.type === 'board' && <BoardBody db={db} rows={rows} view={view} newRow={newRow} />}
      {view.type === 'list' && <ListBody db={db} rows={rows} view={view} newRow={newRow} />}
      {view.type === 'gallery' && <GalleryBody db={db} rows={rows} view={view} newRow={newRow} />}
      {view.type === 'calendar' && <CalendarBody db={db} rows={rows} view={view} newRow={newRow} />}

      {menu?.kind === 'add' && (
        <Popover anchor={menu.rect} onClose={() => setMenu(null)} width={220}>
          <div className="menu-section">Add a view</div>
          {VIEW_TYPES.map((t) => (
            <div
              key={t.type}
              className="menu-item compact"
              onClick={() => {
                const v = newView(t.type, db.schema!)
                S().updateBlock(db.id, { views: [...getViews(db), v] })
                setActiveId(v.id)
                setMenu(null)
              }}
            >
              <span className="db-type-icon">{t.icon}</span> {t.label}
            </div>
          ))}
        </Popover>
      )}
      {menu?.kind === 'view' && (
        <ViewMenu db={db} view={view} anchor={menu.rect} onClose={() => setMenu(null)} canDelete={views.length > 1} />
      )}
      {menu?.kind === 'filter' && <FilterMenu db={db} view={view} anchor={menu.rect} onClose={() => setMenu(null)} />}
      {menu?.kind === 'sort' && <SortMenu db={db} view={view} anchor={menu.rect} onClose={() => setMenu(null)} />}
    </div>
  )
}

// ---- view options ----

function ViewMenu({ db, view, anchor, onClose, canDelete }: { db: Block; view: DbView; anchor: DOMRect; onClose: () => void; canDelete: boolean }) {
  const schema = db.schema!
  const [name, setName] = useState(view.name)
  const saveName = () => name.trim() && name !== view.name && updateView(db, view.id, { name: name.trim() })
  const selects = schema.filter((p) => p.type === 'select')
  const dates = schema.filter((p) => p.type === 'date')
  const set = (patch: Partial<DbView>) => updateView(db, view.id, patch)

  return (
    <Popover anchor={anchor} onClose={() => { saveName(); onClose() }} width={260}>
      <input autoFocus className="db-prop-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName}
        onKeyDown={(e) => e.key === 'Enter' && (saveName(), onClose())} />
      <div className="menu-section">Layout</div>
      <div className="db-layouts">
        {VIEW_TYPES.map((t) => (
          <button
            key={t.type}
            className={t.type === view.type ? 'on' : ''}
            onClick={() => {
              const fresh = newView(t.type, schema)
              set({ type: t.type, group_by: view.group_by ?? fresh.group_by, calendar_by: view.calendar_by ?? fresh.calendar_by, cover: view.cover ?? fresh.cover })
            }}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {view.type === 'board' && (
        <label className="db-view-opt">
          Group by
          <select value={view.group_by ?? ''} onChange={(e) => set({ group_by: e.target.value || undefined })}>
            <option value="">—</option>
            {selects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {view.type === 'calendar' && (
        <label className="db-view-opt">
          Show calendar by
          <select value={view.calendar_by ?? ''} onChange={(e) => set({ calendar_by: e.target.value || undefined })}>
            <option value="">—</option>
            {dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {view.type === 'gallery' && (
        <label className="db-view-opt">
          Card preview
          <select value={view.cover ?? 'page_content'} onChange={(e) => set({ cover: e.target.value as DbView['cover'] })}>
            <option value="page_content">Page content</option>
            <option value="page_cover">Page cover</option>
            <option value="none">None</option>
          </select>
        </label>
      )}
      <div className="menu-section">Properties shown</div>
      {schema
        .filter((p) => p.type !== 'title')
        .map((p) => {
          const shown = !view.hidden?.includes(p.id)
          return (
            <label key={p.id} className="menu-item compact">
              <input
                type="checkbox"
                checked={shown}
                onChange={() => set({ hidden: shown ? [...(view.hidden ?? []), p.id] : (view.hidden ?? []).filter((x) => x !== p.id) })}
              />
              <span className="db-type-icon">{TYPE_ICON[p.type]}</span> {p.name}
            </label>
          )
        })}
      {canDelete && (
        <div className="menu-item compact danger" onClick={() => { updateView(db, view.id, null); onClose() }}>
          🗑 Delete view
        </div>
      )}
    </Popover>
  )
}

// ---- filter & sort ----

function defaultFilter(prop: DbProperty): DbFilter {
  const op = OPERATORS[prop.type][0].op
  return { property: prop.id, operator: op, value: prop.type === 'checkbox' ? true : prop.type === 'select' || prop.type === 'multi_select' ? prop.options?.[0]?.id ?? null : '' }
}

function FilterValue({ prop, filter, onChange }: { prop: DbProperty; filter: DbFilter; onChange: (v: CellValue) => void }) {
  if (!needsValue(filter.operator)) return null
  if (prop.type === 'select' || prop.type === 'multi_select') {
    return (
      <select value={String(filter.value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {prop.options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    )
  }
  if (prop.type === 'checkbox') {
    return (
      <select value={filter.value ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === 'yes')}>
        <option value="yes">Checked</option>
        <option value="no">Unchecked</option>
      </select>
    )
  }
  return (
    <input
      type={prop.type === 'date' ? 'date' : prop.type === 'number' ? 'number' : 'text'}
      value={filter.value == null ? '' : String(filter.value)}
      placeholder="Value"
      onChange={(e) => onChange(prop.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
    />
  )
}

function FilterMenu({ db, view, anchor, onClose }: { db: Block; view: DbView; anchor: DOMRect; onClose: () => void }) {
  const schema = db.schema!
  const { operator, filters } = view.filter
  const setFilters = (next: DbFilter[], op = operator) => updateView(db, view.id, { filter: { operator: op, filters: next } })
  const change = (i: number, patch: Partial<DbFilter>) => setFilters(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  return (
    <Popover anchor={anchor} onClose={onClose} width={460}>
      {filters.length === 0 && <div className="menu-section">No filters. Rows matching a filter stay visible in this view.</div>}
      {filters.map((f, i) => {
        const prop = schema.find((p) => p.id === f.property)
        if (!prop) return null
        return (
          <div key={i} className="db-rule">
            <span className="db-rule-join">
              {i === 0 ? 'Where' : i === 1 ? (
                <select value={operator} onChange={(e) => setFilters(filters, e.target.value as 'and' | 'or')}>
                  <option value="and">And</option>
                  <option value="or">Or</option>
                </select>
              ) : operator === 'and' ? 'And' : 'Or'}
            </span>
            <select value={f.property} onChange={(e) => {
              const p = schema.find((x) => x.id === e.target.value)!
              change(i, defaultFilter(p))
            }}>
              {schema.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={f.operator} onChange={(e) => change(i, { operator: e.target.value as FilterOperator })}>
              {OPERATORS[prop.type].map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            <FilterValue prop={prop} filter={f} onChange={(value) => change(i, { value })} />
            <button className="ctl" title="Remove filter" onClick={() => setFilters(filters.filter((_, j) => j !== i))}>×</button>
          </div>
        )
      })}
      <div className="menu-item compact" onClick={() => setFilters([...filters, defaultFilter(schema[0])])}>＋ Add a filter</div>
    </Popover>
  )
}

function SortMenu({ db, view, anchor, onClose }: { db: Block; view: DbView; anchor: DOMRect; onClose: () => void }) {
  const schema = db.schema!
  const setSort = (sort: DbView['sort']) => updateView(db, view.id, { sort })
  const unused = schema.find((p) => !view.sort.some((s) => s.property === p.id))
  return (
    <Popover anchor={anchor} onClose={onClose} width={340}>
      {view.sort.length === 0 && <div className="menu-section">No sorts. Rows are in the order they were added.</div>}
      {view.sort.map((s, i) => (
        <div key={i} className="db-rule">
          <select value={s.property} onChange={(e) => setSort(view.sort.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)))}>
            {schema.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={s.direction} onChange={(e) => setSort(view.sort.map((x, j) => (j === i ? { ...x, direction: e.target.value as 'ascending' | 'descending' } : x)))}>
            <option value="ascending">Ascending</option>
            <option value="descending">Descending</option>
          </select>
          <button className="ctl" title="Remove sort" onClick={() => setSort(view.sort.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {unused && (
        <div className="menu-item compact" onClick={() => setSort([...view.sort, { property: unused.id, direction: 'ascending' }])}>
          ＋ Add a sort
        </div>
      )}
    </Popover>
  )
}

// ---- layouts ----

interface BodyProps {
  db: Block
  rows: Block[]
  view: DbView
  newRow: (cells?: Record<string, CellValue>) => string
}

/** Non-empty, visible properties of a row, as small read-only values for cards and lists. */
function CardProps({ db, row, view, skip }: { db: Block; row: Block; view: DbView; skip?: string }) {
  const props = db.schema!.filter((p) => p.type !== 'title' && p.id !== skip && !view.hidden?.includes(p.id))
  return (
    <>
      {props.map((p) => {
        const v = row.properties.cells?.[p.id]
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (p.type === 'checkbox' && !v)) return null
        if (p.type === 'select' || p.type === 'multi_select') {
          const ids = Array.isArray(v) ? v : [String(v)]
          return (
            <div key={p.id} className="db-card-prop">
              {ids.map((id) => p.options?.find((o) => o.id === id)).filter(Boolean).map((o) => <Pill key={o!.id} option={o!} />)}
            </div>
          )
        }
        return (
          <div key={p.id} className="db-card-prop muted small" title={p.name}>
            {p.type === 'checkbox' ? `☑ ${p.name}` : p.type === 'url' ? String(v).replace(/^https?:\/\//, '') : String(v)}
          </div>
        )
      })}
    </>
  )
}

function Card({ db, row, view, skip, children }: { db: Block; row: Block; view: DbView; skip?: string; children?: React.ReactNode }) {
  return (
    <div
      className="db-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-db-row', row.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => S().openPage(row.id)}
    >
      {children}
      <div className="db-card-title">
        {row.format.icon && <span>{row.format.icon} </span>}
        {pageTitle(row)}
      </div>
      <CardProps db={db} row={row} view={view} skip={skip} />
    </div>
  )
}

/** Drop target that sets a cell when a card is dropped on it. */
function dropProps(onDropRow: (rowId: string) => void) {
  return {
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-db-row')) {
        e.preventDefault()
        e.currentTarget.classList.add('drop-on')
      }
    },
    onDragLeave: (e: DragEvent) => e.currentTarget.classList.remove('drop-on'),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      e.currentTarget.classList.remove('drop-on')
      const id = e.dataTransfer.getData('application/x-db-row')
      if (id) onDropRow(id)
    },
  }
}

function BoardBody({ db, rows, view, newRow }: BodyProps) {
  const board = boardGroups(db, view, rows)
  if (!board) {
    return (
      <div className="db-empty-view">
        A board groups rows into columns by a <b>Select</b> property.{' '}
        <button className="btn small" onClick={() => addProperty(db, 'select', 'Status', (id) => updateView(db, view.id, { group_by: id }))}>
          Add a “Status” property
        </button>
      </div>
    )
  }
  const { prop, groups } = board
  return (
    <div className="db-board">
      {groups.map((g) => (
        <div key={g.id ?? 'none'} className="db-board-col" {...dropProps((rowId) => S().setCell(rowId, prop.id, g.id))}>
          <div className="db-board-head">
            {g.id ? <Pill option={{ id: g.id, name: g.label, color: g.color }} /> : <span className="muted">{g.label}</span>}
            <span className="muted small">{g.rows.length}</span>
          </div>
          {g.rows.map((r) => (
            <Card key={r.id} db={db} row={r} view={view} skip={prop.id} />
          ))}
          <button className="db-card-new" onClick={() => S().openPage(newRow({ [prop.id]: g.id }))}>＋ New</button>
        </div>
      ))}
    </div>
  )
}

function ListBody({ db, rows, view, newRow }: BodyProps) {
  return (
    <div className="db-list">
      {rows.map((r) => (
        <div key={r.id} className="db-list-row" onClick={() => S().openPage(r.id)}>
          <span className="db-row-icon">{r.format.icon ?? '📄'}</span>
          <span className="db-list-title">{pageTitle(r)}</span>
          <span style={{ flex: 1 }} />
          <CardProps db={db} row={r} view={view} />
        </div>
      ))}
      <button className="db-new-row" onClick={() => S().openPage(newRow())}>＋ New</button>
    </div>
  )
}

/** First lines of a row page's own content, for gallery previews. */
function contentPreview(row: Block, blocks: Record<string, Block>) {
  return row.content
    .map((id) => blocks[id])
    .filter((b) => b?.alive && b.type !== 'page')
    .slice(0, 6)
    .map((b) => htmlToPlain(b.properties.title))
    .filter(Boolean)
}

function GalleryBody({ db, rows, view, newRow }: BodyProps) {
  const blocks = useStore((s) => s.blocks)
  const mode = view.cover ?? 'page_content'
  return (
    <div className="db-gallery">
      {rows.map((r) => (
        <Card key={r.id} db={db} row={r} view={view}>
          {mode === 'page_cover' && <div className="db-gallery-cover" style={{ background: coverCss(r.format.cover) ?? 'var(--bg-hover)' }} />}
          {mode === 'page_content' && (
            <div className="db-gallery-preview">
              {contentPreview(r, blocks).map((t, i) => <div key={i}>{t}</div>)}
            </div>
          )}
        </Card>
      ))}
      <button className="db-gallery-new" onClick={() => S().openPage(newRow())}>＋ New</button>
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function CalendarBody({ db, rows, view, newRow }: BodyProps) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const prop = db.schema!.find((p) => p.id === view.calendar_by && p.type === 'date')
  if (!prop) {
    return (
      <div className="db-empty-view">
        A calendar places rows on days using a <b>Date</b> property.{' '}
        <button className="btn small" onClick={() => addProperty(db, 'date', 'Date', (id) => updateView(db, view.id, { calendar_by: id }))}>
          Add a “Date” property
        </button>
      </div>
    )
  }
  // Six weeks starting on the Sunday on or before the 1st, like Notion's month view.
  const start = new Date(month)
  start.setDate(1 - start.getDay())
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const byDay = new Map<string, Block[]>()
  for (const r of rows) {
    const d = r.properties.cells?.[prop.id]
    if (typeof d === 'string') byDay.set(d, [...(byDay.get(d) ?? []), r])
  }
  const today = isoDay(new Date())
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="db-calendar">
      <div className="db-cal-head">
        <b>{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</b>
        <span style={{ flex: 1 }} />
        <button className="ctl" title="Previous month" onClick={() => shift(-1)}>‹</button>
        <button className="btn small" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        <button className="ctl" title="Next month" onClick={() => shift(1)}>›</button>
      </div>
      <div className="db-cal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="db-cal-dow">{d}</div>)}
        {days.map((d) => {
          const key = isoDay(d)
          return (
            <div
              key={key}
              className={`db-cal-day ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${key === today ? 'today' : ''}`}
              {...dropProps((rowId) => S().setCell(rowId, prop.id, key))}
            >
              <div className="db-cal-num">
                <span>{d.getDate()}</span>
                <button className="ctl db-cal-add" title="New row on this day" onClick={() => S().openPage(newRow({ [prop.id]: key }))}>＋</button>
              </div>
              {(byDay.get(key) ?? []).map((r) => (
                <Card key={r.id} db={db} row={r} view={view} skip={prop.id} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function addProperty(db: Block, type: DbProperty['type'], name: string, then: (id: string) => void) {
  const id = shortId()
  S().transact(() => {
    S().updateBlock(db.id, { schema: [...db.schema!, { id, name, type, ...(type === 'select' ? { options: [] } : {}) }] })
    then(id)
  })
}

