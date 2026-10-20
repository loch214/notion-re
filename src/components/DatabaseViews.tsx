// Database views: tabs (table / board / list / gallery / calendar), filter and sort controls,
// and the non-table layouts. Modelled on Notion's collection views (analysis/databases.md).

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Icon, PlusIcon, type IconName } from './Icons'
import { openRow } from './Peek'
import { addDays, daysBetween, endDay, formatDateValue, formatTime, isoDay, moveDate, parseDate, RELATIVE_DAYS, shiftDate, startDay, toDate, todayIso, weekStartsMonday, WITHIN } from '../../shared/dates'
import { cellRaw, coverCss, dbTemplates, htmlToPlain, isSingleChoice, shortId, statusOptions } from '../../shared/blocks.ts'
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

const VIEW_ICONS: Record<string, IconName> = { table: 'tableView', board: 'board', list: 'list', gallery: 'gallery', calendar: 'calendar', timeline: 'timeline' }

function viewKey(dbId: string) {
  return `notion-re:view:${dbId}`
}

export function DatabaseView({ dbId }: { dbId: string }) {
  const db = useStore((s) => s.blocks[dbId])
  const blocks = useStore((s) => s.blocks)
  const [activeId, setActiveId] = useState(() => localStorage.getItem(viewKey(dbId)) ?? '')
  const [menu, setMenu] = useState<{ kind: 'view' | 'add' | 'filter' | 'sort' | 'templates' | 'switch'; rect: DOMRect } | null>(null)

  useEffect(() => {
    if (activeId) localStorage.setItem(viewKey(dbId), activeId)
  }, [activeId, dbId])

  const views = db?.schema ? getViews(db) : []
  const view = views.find((v) => v.id === activeId) ?? views[0]
  const [searching, setSearching] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 640))
    ro.observe(el)
    return () => ro.disconnect()
  }, [!!db?.schema])
  const [find, setFind] = useState('')
  const rows = useMemo(() => {
    const all = db?.schema && view ? applyView(blocks, db, view) : []
    const q = find.trim().toLowerCase()
    // The toolbar's search box: rows whose name or any cell contains the text.
    return q ? all.filter((r) => `${r.properties.title} ${Object.values(r.properties.cells ?? {}).join(' ')}`.toLowerCase().includes(q)) : all
  }, [blocks, db, view, find])
  if (!db?.schema || !view) return null

  /** New row that shows up in this view, optionally with extra values (board column, calendar day). */
  const newRow = (cells: Record<string, CellValue> = {}) => {
    let id = ''
    S().transact(() => {
      id = S().newDbRow(db.id, undefined, { ...prefillFor(view), ...cells })
    })
    return id
  }

  const open = (kind: 'view' | 'add' | 'filter' | 'sort' | 'templates' | 'switch') => (e: React.MouseEvent<HTMLElement>) =>
    setMenu({ kind, rect: e.currentTarget.getBoundingClientRect() })

  return (
    <div className="db" ref={boxRef}>
      <div className={`db-views ${narrow ? 'narrow' : ''}`}>
        {narrow && (
          <button className="db-view-tab active db-view-switch" title="Switch view" onClick={open('switch')}>
            <Icon name={VIEW_ICONS[view.type]} size={16} /> {view.name} <Icon name="down" size={12} />
          </button>
        )}
        {!narrow && views.map((v) => (
          <button
            key={v.id}
            className={`db-view-tab ${v.id === view.id ? 'active' : ''}`}
            onClick={(e) => (v.id === view.id ? open('view')(e) : setActiveId(v.id))}
            title={v.id === view.id ? 'View options' : undefined}
          >
            <Icon name={VIEW_ICONS[v.type]} size={16} /> {v.name}
          </button>
        ))}
        {!narrow && <button className="db-view-tab db-view-add" title="Add a view" onClick={open('add')}>
          <PlusIcon />
        </button>}
        <span style={{ flex: 1 }} />
        <button className={`ctl db-tool ${view.filter.filters.length ? 'on' : ''}`} title={view.filter.filters.length ? `Filter · ${view.filter.filters.length}` : 'Filter'} onClick={open('filter')}>
          <Icon name="filter" size={16} />
        </button>
        <button className={`ctl db-tool ${view.sort.length ? 'on' : ''}`} title={view.sort.length ? `Sort · ${view.sort.length}` : 'Sort'} onClick={open('sort')}>
          <Icon name="sort" size={16} />
        </button>
        {narrow && !searching ? null : searching ? (
          <span className="db-search">
            <Icon name="search" size={14} />
            <input autoFocus placeholder="Type to search…" value={find} onChange={(e) => setFind(e.target.value)} onBlur={() => !find && setSearching(false)} onKeyDown={(e) => e.key === 'Escape' && (setFind(''), setSearching(false))} />
          </span>
        ) : (
          <button className="ctl db-tool" title="Search" onClick={() => setSearching(true)}>
            <Icon name="search" size={16} />
          </button>
        )}
        <button className="ctl db-tool" title="View settings" onClick={open('view')}>
          <Icon name="sliders" size={16} />
        </button>
        <span className="db-new-split">
          <button className="btn primary small" onClick={() => openRow(newRow(), view)}>New</button>
          <button className="btn primary small db-new-more" title="Templates" onClick={open('templates')}>
            <Icon name="down" size={12} />
          </button>
        </span>
      </div>
      {menu?.kind === 'switch' && (
        <Popover anchor={menu.rect} onClose={() => setMenu(null)} width={240}>
          {views.map((v) => (
            <button key={v.id} className={`menu-item compact ${v.id === view.id ? 'active' : ''}`} onClick={() => { setActiveId(v.id); setMenu(null) }}>
              <Icon name={VIEW_ICONS[v.type]} size={16} /> <span style={{ flex: 1 }}>{v.name}</span> {v.id === view.id && <Icon name="check" size={14} />}
            </button>
          ))}
          <button className="menu-item compact" onClick={() => setMenu({ kind: 'add', rect: menu.rect })}>
            <PlusIcon /> Add view
          </button>
        </Popover>
      )}
      {menu?.kind === 'templates' && <TemplatesMenu db={db} view={view} anchor={menu.rect} onClose={() => setMenu(null)} />}

      {view.type === 'table' && <TableBody db={db} rows={rows} view={view} onNewRow={() => newRow()} />}
      {view.type === 'board' && <BoardBody db={db} rows={rows} view={view} newRow={newRow} />}
      {view.type === 'list' && <ListBody db={db} rows={rows} view={view} newRow={newRow} />}
      {view.type === 'gallery' && <GalleryBody db={db} rows={rows} view={view} newRow={newRow} />}
      {view.type === 'calendar' && <CalendarBody db={db} rows={rows} view={view} newRow={newRow} />}
      {view.type === 'timeline' && <TimelineBody db={db} rows={rows} view={view} newRow={newRow} />}

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
              <span className="db-type-icon"><Icon name={VIEW_ICONS[t.type]} size={16} /></span> {t.label}
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

// ---- database templates ("New" ▾) ----

function TemplatesMenu({ db, view, anchor, onClose }: { db: Block; view: DbView; anchor: DOMRect; onClose: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const templates = dbTemplates(blocks, db)
  const [more, setMore] = useState<{ id: string; rect: DOMRect } | null>(null)
  const isDefault = (id: string | null) => (db.format.default_template ?? null) === id
  const use = (id: string | null) => {
    let row = ''
    S().transact(() => {
      row = S().newDbRow(db.id, id, prefillFor(view))
    })
    onClose()
    openRow(row, view)
  }
  const edit = (id: string) => {
    onClose()
    S().openPage(id)
  }
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      <div className="menu-section">Templates for <b>{pageTitle(db)}</b></div>
      {templates.map((t) => (
        <div key={t.id} className="menu-item compact tpl-item" onClick={() => use(t.id)}>
          <span className="tpl-icon">{t.format.icon ?? <Icon name="page" size={16} />}</span>
          <span className="tpl-name">{pageTitle(t)}</span>
          {isDefault(t.id) && <span className="tpl-default">Default</span>}
          <button
            className="ctl tpl-more"
            title="Edit, duplicate, delete…"
            onClick={(e) => {
              e.stopPropagation()
              setMore({ id: t.id, rect: e.currentTarget.getBoundingClientRect() })
            }}
          >
            <Icon name="more" size={14} />
          </button>
        </div>
      ))}
      <div className="menu-item compact tpl-item" onClick={() => use(null)}>
        <span className="tpl-icon"><Icon name="page" size={16} /></span>
        <span className="tpl-name">Empty page</span>
        {isDefault(null) && templates.length > 0 && <span className="tpl-default">Default</span>}
        {templates.length > 0 && !isDefault(null) && (
          <button className="ctl tpl-more" title="Set as default" onClick={(e) => { e.stopPropagation(); S().updateBlock(db.id, { format: { default_template: undefined } }) }}>
            <Icon name="check" size={14} />
          </button>
        )}
      </div>
      <div className="menu-sep" />
      <div className="menu-item compact muted" onClick={() => edit(S().addDbTemplate(db.id))}>
        <PlusIcon size={13} /> New template
      </div>
      {more && (
        <Popover anchor={more.rect} onClose={() => setMore(null)} width={200}>
          <div className="menu-item compact" onClick={() => { S().updateBlock(db.id, { format: { default_template: isDefault(more.id) ? undefined : more.id } }); setMore(null) }}>
            <Icon name="check" size={16} /> {isDefault(more.id) ? 'Remove as default' : 'Set as default'}
          </div>
          <div className="menu-item compact" onClick={() => edit(more.id)}>
            <Icon name="compose" size={16} /> Edit
          </div>
          <div className="menu-item compact" onClick={() => { S().duplicate(more.id); setMore(null) }}>
            <Icon name="page" size={16} /> Duplicate
          </div>
          <div
            className="menu-item compact danger"
            onClick={() => {
              S().transact(() => {
                if (isDefault(more.id)) S().updateBlock(db.id, { format: { default_template: undefined } })
                S().removeBlock(more.id)
              })
              setMore(null)
            }}
          >
            <Icon name="trash" size={16} /> Delete
          </div>
        </Popover>
      )}
    </Popover>
  )
}

// ---- view options ----

function ViewMenu({ db, view, anchor, onClose, canDelete }: { db: Block; view: DbView; anchor: DOMRect; onClose: () => void; canDelete: boolean }) {
  const schema = db.schema!
  const [name, setName] = useState(view.name)
  const saveName = () => name.trim() && name !== view.name && updateView(db, view.id, { name: name.trim() })
  const selects = schema.filter((p) => isSingleChoice(p.type))
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
              set({ type: t.type, group_by: view.group_by ?? fresh.group_by, calendar_by: view.calendar_by ?? fresh.calendar_by, timeline_by: view.timeline_by ?? fresh.timeline_by, cover: view.cover ?? fresh.cover })
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
      <label className="db-view-opt">
        Open pages in
        <select value={view.open_in ?? 'side_peek'} onChange={(e) => set({ open_in: e.target.value === 'full_page' ? 'full_page' : undefined })}>
          <option value="side_peek">Side peek</option>
          <option value="full_page">Full page</option>
        </select>
      </label>
      {view.type === 'timeline' && (
        <label className="db-view-opt">
          Show timeline by
          <select value={view.timeline_by ?? ''} onChange={(e) => set({ timeline_by: e.target.value || undefined })}>
            <option value="">—</option>
            {dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
  if (op === 'date_is') return { property: prop.id, operator: op, value: 'today' }
  return { property: prop.id, operator: op, value: prop.type === 'checkbox' ? true : isSingleChoice(prop.type) || prop.type === 'multi_select' ? prop.options?.[0]?.id ?? null : '' }
}

function FilterValue({ prop, filter, onChange }: { prop: DbProperty; filter: DbFilter; onChange: (v: CellValue) => void }) {
  if (!needsValue(filter.operator)) return null
  if (isSingleChoice(prop.type) || prop.type === 'multi_select') {
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
  if (prop.type === 'date' || prop.type === 'created_time' || prop.type === 'last_edited_time') {
    // Notion: a relative day ("Today", "One week ago"…) or an exact date; "is within" takes a range.
    if (filter.operator === 'date_is_within') {
      return (
        <select value={String(filter.value ?? 'past_week')} onChange={(e) => onChange(e.target.value)}>
          {WITHIN.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
        </select>
      )
    }
    const rel = RELATIVE_DAYS.some((r) => r.value === filter.value)
    return (
      <span className="filter-date">
        <select value={rel ? String(filter.value) : 'exact'} onChange={(e) => onChange(e.target.value === 'exact' ? todayIso() : e.target.value)}>
          {RELATIVE_DAYS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          <option value="exact">Exact date</option>
        </select>
        {!rel && <input type="date" value={typeof filter.value === 'string' ? filter.value.slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} />}
      </span>
    )
  }
  return (
    <input
      type={prop.type === 'number' ? 'number' : 'text'}
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
            <select value={f.operator} onChange={(e) => {
              const op = e.target.value as FilterOperator
              const within = WITHIN.some((w) => w.value === f.value)
              change(i, { operator: op, ...(op === 'date_is_within' && !within ? { value: 'past_week' } : op.startsWith('date_') && op !== 'date_is_within' && within ? { value: 'today' } : {}) })
            }}>
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
        const v = cellRaw(p, row)
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (p.type === 'checkbox' && !v)) return null
        if (isSingleChoice(p.type) || p.type === 'multi_select') {
          const ids = Array.isArray(v) ? v : [String(v)]
          return (
            <div key={p.id} className="db-card-prop">
              {ids.map((id) => p.options?.find((o) => o.id === id)).filter(Boolean).map((o) => <Pill key={o!.id} option={o!} dot={p.type === 'status'} />)}
            </div>
          )
        }
        return (
          <div key={p.id} className="db-card-prop muted small" title={p.name}>
            {p.type === 'checkbox' ? `☑ ${p.name}` : p.type === 'date' ? formatDateValue(v, p) : p.type === 'url' ? String(v).replace(/^https?:\/\//, '') : String(v)}
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
      data-row-id={row.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-db-row', row.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => openRow(row.id, view)}
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
        <button className="btn small" onClick={() => addProperty(db, 'status', 'Status', (id) => updateView(db, view.id, { group_by: id }))}>
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
            {g.id ? <Pill option={{ id: g.id, name: g.label, color: g.color }} dot={prop.type === 'status'} /> : <span className="muted">{g.label}</span>}
            <span className="muted small">{g.rows.length}</span>
          </div>
          {g.rows.map((r) => (
            <Card key={r.id} db={db} row={r} view={view} skip={prop.id} />
          ))}
          <button className="db-card-new" onClick={() => openRow(newRow({ [prop.id]: g.id }), view)}>＋ New</button>
        </div>
      ))}
    </div>
  )
}

function ListBody({ db, rows, view, newRow }: BodyProps) {
  return (
    <div className="db-list">
      {rows.map((r) => (
        <div key={r.id} className="db-list-row" data-row-id={r.id} onClick={() => openRow(r.id, view, rows.map((x) => x.id))}>
          {r.format.icon && <span className="db-row-icon">{r.format.icon}</span>}
          <span className="db-list-title">{pageTitle(r)}</span>
          <span className="db-list-props">
            <CardProps db={db} row={r} view={view} />
          </span>
        </div>
      ))}
      <button className="db-new-row" onClick={() => openRow(newRow(), view)}>＋ New page</button>
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
      <button className="db-gallery-new" onClick={() => openRow(newRow(), view)}>＋ New</button>
    </div>
  )
}


function CalendarBody({ db, rows, view, newRow }: BodyProps) {
  const week = view.calendar_range === 'week'
  const [anchor, setAnchor] = useState(() => todayIso())
  const [noDate, setNoDate] = useState<DOMRect | null>(null)
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
  const monday = weekStartsMonday()
  const weekStart = (day: string) => addDays(day, -((toDate(day).getDay() - (monday ? 1 : 0) + 7) % 7))
  const monthFirst = anchor.slice(0, 8) + '01'
  // Month: six weeks from the week holding the 1st, like Notion. Week: the week holding the anchor day.
  const first = week ? weekStart(anchor) : weekStart(monthFirst)
  const weeks = Array.from({ length: week ? 1 : 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i)))
  const dows = Array.from({ length: 7 }, (_, i) => toDate(addDays(first, i)).toLocaleDateString('en-US', { weekday: 'short' }))
  const today = todayIso()
  const items = rows
    .map((r) => ({ r, a: startDay(cellRaw(prop, r)), b: endDay(cellRaw(prop, r)) }))
    .filter((x): x is { r: Block; a: string; b: string } => !!x.a && !!x.b)
    .sort((x, y) => (x.a === y.a ? (y.b > x.b ? 1 : -1) : x.a < y.a ? -1 : 1))
  const shift = (n: number) => {
    if (week) setAnchor(addDays(anchor, 7 * n))
    else {
      const d = toDate(monthFirst)
      setAnchor(isoDay(new Date(d.getFullYear(), d.getMonth() + n, 1)))
    }
  }
  const title = toDate(week ? first : monthFirst).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  // Notion's "No date" list: rows without a date; drag one onto a day to give it that date.
  const undated = rows.filter((r) => !startDay(cellRaw(prop, r)))

  return (
    <div className={`db-calendar ${week ? 'week' : ''}`}>
      <div className="db-cal-head">
        <b>{title}</b>
        <span style={{ flex: 1 }} />
        {undated.length > 0 && (
          <button className={`db-cal-today ${noDate ? 'on' : ''}`} onClick={(e) => setNoDate(noDate ? null : e.currentTarget.getBoundingClientRect())}>
            No date ({undated.length})
          </button>
        )}
        {noDate && (
          <Popover anchor={noDate} onClose={() => setNoDate(null)} width={260}>
            <div className="menu-section">No date · drag onto a day</div>
            {undated.map((r) => (
              <div
                key={r.id}
                className="menu-item compact"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-db-row', r.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => {
                  setNoDate(null)
                  openRow(r.id, view)
                }}
              >
                {r.format.icon ?? <Icon name="page" size={16} />} {pageTitle(r)}
              </div>
            ))}
          </Popover>
        )}
        <span className="db-cal-mode">
          <button className={week ? '' : 'on'} onClick={() => updateView(db, view.id, { calendar_range: undefined })}>Month</button>
          <button className={week ? 'on' : ''} onClick={() => updateView(db, view.id, { calendar_range: 'week' })}>Week</button>
        </span>
        <button className="ctl" title={week ? 'Previous week' : 'Previous month'} onClick={() => shift(-1)}><Icon name="left" size={14} /></button>
        <button className="db-cal-today" onClick={() => setAnchor(today)}>Today</button>
        <button className="ctl" title={week ? 'Next week' : 'Next month'} onClick={() => shift(1)}><Icon name="right" size={14} /></button>
      </div>
      <div className="db-cal-dows">
        {dows.map((d) => <div key={d} className="db-cal-dow">{d}</div>)}
      </div>
      {weeks.map((days) => {
        // Rows that touch this week, each placed in the first free lane (multi-day rows become one bar).
        const lanes: string[][] = []
        const placed = items
          .filter((x) => x.a <= days[6] && x.b >= days[0])
          .map((x) => {
            const s = Math.max(0, days.indexOf(x.a < days[0] ? days[0] : x.a))
            const e = days.indexOf(x.b > days[6] ? days[6] : x.b)
            let lane = lanes.findIndex((l) => l.every((d) => d < days[s] || d > days[e]))
            if (lane < 0) lane = lanes.push([]) - 1
            lanes[lane].push(...days.slice(s, e + 1))
            return { ...x, s, e, lane, cont: x.a < days[0], more: x.b > days[6] }
          })
        return (
          <div key={days[0]} className="db-cal-week" style={{ gridTemplateRows: `30px repeat(${lanes.length}, auto) 1fr` }}>
            {days.map((d, i) => (
              <div
                key={d}
                className={`db-cal-day ${!week && d.slice(0, 7) !== monthFirst.slice(0, 7) ? 'other' : ''} ${d === today ? 'today' : ''}`}
                style={{ gridColumn: i + 1 }}
                {...dropProps((rowId) => S().setCell(rowId, prop.id, moveDate(S().blocks[rowId]?.properties.cells?.[prop.id], d)))}
              >
                <div className="db-cal-num">
                  <button className="ctl db-cal-add" title="New page on this day" onClick={() => openRow(newRow({ [prop.id]: d }), view)}><PlusIcon size={13} /></button>
                  <span>{d.endsWith('-01') && !week ? toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : Number(d.slice(8))}</span>
                </div>
              </div>
            ))}
            {placed.map((x) => (
              <div key={x.r.id} className={`db-cal-item ${x.cont ? 'cont' : ''} ${x.more ? 'more' : ''}`} style={{ gridColumn: `${x.s + 1} / ${x.e + 2}`, gridRow: x.lane + 2 }}>
                <Card db={db} row={x.r} view={view} skip={prop.id}>
                  {parseDate(cellRaw(prop, x.r))?.startTime && !x.cont && (
                    <span className="db-cal-time">{formatTime(parseDate(cellRaw(prop, x.r))!.startTime!, prop.time_format)}</span>
                  )}
                </Card>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---- timeline ----

const ZOOM_PX = { week: 96, month: 40, quarter: 14 } as const
const ZOOM_LABEL = { week: 'Week', month: 'Month', quarter: 'Quarter' } as const

function TimelineBody({ db, rows, view, newRow }: BodyProps) {
  const zoom = view.timeline_zoom ?? 'month'
  const ppd = ZOOM_PX[zoom]
  const today = todayIso()
  const [first, setFirst] = useState(() => addDays(today, -45))
  const span = 200
  const scroller = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; part: 'move' | 'start' | 'end'; x: number; days: number } | null>(null)
  const prop = db.schema!.find((p) => p.id === view.timeline_by && p.type === 'date')

  const scrollTo = (day: string, smooth = false) => {
    const el = scroller.current
    if (el) el.scrollTo({ left: Math.max(0, daysBetween(first, day) * ppd - el.clientWidth / 3), behavior: smooth ? 'smooth' : 'auto' })
  }
  useEffect(() => {
    scrollTo(today)
  }, [zoom, first])

  if (!prop) {
    return (
      <div className="db-empty-view">
        A timeline shows rows as bars using a <b>Date</b> property (with an end date for longer bars).{' '}
        <button className="btn small" onClick={() => addProperty(db, 'date', 'Date', (id) => updateView(db, view.id, { timeline_by: id }))}>
          Add a “Date” property
        </button>
      </div>
    )
  }

  const days = Array.from({ length: span }, (_, i) => addDays(first, i))
  const months: { label: string; from: number; n: number }[] = []
  days.forEach((d, i) => {
    const label = toDate(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (months.at(-1)?.label === label) months.at(-1)!.n++
    else months.push({ label, from: i, n: 1 })
  })

  // Dragging a bar (or its edges) moves the date by whole days; it's saved on release.
  const startDrag = (e: React.PointerEvent, id: string, part: 'move' | 'start' | 'end') => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    let moved = 0
    const move = (m: PointerEvent) => {
      moved = Math.round((m.clientX - x0) / ppd)
      setDrag({ id, part, x: x0, days: moved })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      const row = S().blocks[id]
      if (moved && row) S().setCell(id, prop.id, shiftDate(row.properties.cells?.[prop.id], moved, part))
      else if (!moved && part === 'move') openRow(id, view)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const width = span * ppd
  return (
    <div className="db-timeline">
      <div className="db-tl-head">
        <span style={{ flex: 1 }} />
        <span className="db-cal-mode">
          {(['week', 'month', 'quarter'] as const).map((z) => (
            <button key={z} className={z === zoom ? 'on' : ''} onClick={() => updateView(db, view.id, { timeline_zoom: z === 'month' ? undefined : z })}>{ZOOM_LABEL[z]}</button>
          ))}
        </span>
        <button className="ctl" title="Earlier" onClick={() => setFirst(addDays(first, -60))}><Icon name="left" size={14} /></button>
        <button className="db-cal-today" onClick={() => scrollTo(today, true)}>Today</button>
        <button className="ctl" title="Later" onClick={() => setFirst(addDays(first, 60))}><Icon name="right" size={14} /></button>
      </div>
      <div className="db-tl-body">
        <div className="db-tl-names">
          <div className="db-tl-names-head">{db.schema!.find((p) => p.type === 'title')?.name ?? 'Name'}</div>
          {rows.map((r) => (
            <div key={r.id} className="db-tl-name" onClick={() => openRow(r.id, view, rows.map((x) => x.id))}>
              {r.format.icon ? <span>{r.format.icon}</span> : <Icon name="page" size={16} />}
              <span className="db-tl-name-text">{pageTitle(r)}</span>
            </div>
          ))}
          <button className="db-tl-new" onClick={() => openRow(newRow({ [prop.id]: today }), view)}><PlusIcon size={13} /> New</button>
        </div>
        <div className="db-tl-scroll" ref={scroller}>
          <div className="db-tl-grid" style={{ width }}>
            <div className="db-tl-months">
              {months.map((m) => <div key={m.label} style={{ left: m.from * ppd, width: m.n * ppd }}><span>{m.label}</span></div>)}
            </div>
            <div className="db-tl-days">
              {days.map((d, i) => {
                const dt = toDate(d)
                const show = zoom !== 'quarter' || dt.getDay() === 1
                return (
                  <div key={d} className={`db-tl-day ${d === today ? 'today' : ''} ${dt.getDay() % 6 === 0 ? 'weekend' : ''}`} style={{ left: i * ppd, width: ppd }}>
                    {show && <span>{zoom === 'week' ? dt.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) : dt.getDate()}</span>}
                  </div>
                )
              })}
            </div>
            <div className="db-tl-lanes" style={{ height: rows.length * 36 + 36 }}>
              {days.map((d, i) => (dayIsWeekend(d) && zoom !== 'quarter' ? <div key={d} className="db-tl-shade" style={{ left: i * ppd, width: ppd }} /> : null))}
              {daysBetween(first, today) >= 0 && daysBetween(first, today) < span && (
                <div className="db-tl-now" style={{ left: daysBetween(first, today) * ppd + ppd / 2 }} />
              )}
              {rows.map((r, i) => {
                const v = r.properties.cells?.[prop.id]
                const a = startDay(v)
                const b = endDay(v)
                if (!a || !b) {
                  return (
                    <div
                      key={r.id}
                      className="db-tl-lane empty"
                      style={{ top: i * 36 }}
                      title="Click to set a date"
                      onClick={(e) => {
                        const x = e.clientX - e.currentTarget.getBoundingClientRect().left
                        S().setCell(r.id, prop.id, addDays(first, Math.floor(x / ppd)))
                      }}
                    />
                  )
                }
                const d = drag?.id === r.id ? drag : null
                const s = daysBetween(first, a) + (d && d.part !== 'end' ? d.days : 0)
                const e = daysBetween(first, b) + (d && d.part !== 'start' ? d.days : 0)
                const left = Math.min(s, e)
                return (
                  <div key={r.id} className="db-tl-lane" style={{ top: i * 36 }}>
                    <div
                      className={`db-tl-bar ${d ? 'dragging' : ''} ${(Math.abs(e - s) + 1) * ppd < 110 ? 'short' : ''}`}
                      style={{ left: left * ppd + 2, width: Math.max(1, Math.abs(e - s) + 1) * ppd - 4 }}
                      onPointerDown={(ev) => startDrag(ev, r.id, 'move')}
                    >
                      <span className="db-tl-handle start" onPointerDown={(ev) => startDrag(ev, r.id, 'start')} />
                      <span className="db-tl-bar-title">{r.format.icon ? `${r.format.icon} ` : ''}{pageTitle(r)}</span>
                      <span className="db-tl-handle end" onPointerDown={(ev) => startDrag(ev, r.id, 'end')} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const dayIsWeekend = (d: string) => toDate(d).getDay() % 6 === 0

function addProperty(db: Block, type: DbProperty['type'], name: string, then: (id: string) => void) {
  const id = shortId()
  S().transact(() => {
    S().updateBlock(db.id, { schema: [...db.schema!, { id, name, type, ...(type === 'status' ? { options: statusOptions() } : type === 'select' ? { options: [] } : {}) }] })
    then(id)
  })
}

