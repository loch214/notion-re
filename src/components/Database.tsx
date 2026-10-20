// Database table view (full-page database) and the property editors shared with row pages.
// Model: the database is a page with a `schema`; each row is a child page whose cell
// values live in `properties.cells[propertyId]`.

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DateCell } from './DatePicker'
import { openRow } from './Peek'
import { DragIcon, Icon, PlusIcon, TriangleIcon } from './Icons'
import { ActionMenu, type MenuEntry } from './Menu'
import { pageUrl } from '../router'
import { askNotificationPermission } from '../reminders'
import { cellRaw, dbRows, isSingleChoice, OPTION_COLORS, PROPERTY_TYPES, shortId, statusOptions } from '../../shared/blocks.ts'
import { DATE_FORMATS, isDateValue } from '../../shared/dates.ts'
import { calcLabel, calcOptions, calculate, formatNumber, NUMBER_FORMATS, parseNumber } from '../../shared/calc.ts'
import { getViews } from '../../shared/views.ts'
import { useStore } from '../store'
import type { Block, CellValue, DbProperty, DbView, PropertyType, SelectOption } from '../types'

export const TYPE_ICON: Record<PropertyType, string> = {
  title: 'Aa',
  ...Object.fromEntries(PROPERTY_TYPES.map((t) => [t.type, t.icon])),
} as Record<PropertyType, string>

/** True inside a table column with "Wrap content" on: text cells grow to show every line. */
const WrapCtx = createContext(false)

const defaultWidth = (p: DbProperty) => p.width ?? (p.type === 'title' ? 260 : p.type === 'checkbox' ? 90 : 180)

/** Floating panel under an anchor element, closed by clicking outside or Escape. */
export function Popover({ anchor, onClose, children, width = 240, height }: { anchor: DOMRect; onClose: () => void; children: ReactNode; width?: number; height?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const left = Math.min(anchor.left, window.innerWidth - width - 12)
  // A tall popover (date picker) goes wherever it fits, else as low as it can without leaving the window.
  const need = height ?? 300
  const below = window.innerHeight - anchor.bottom > need
  const above = anchor.top > need
  const style = below || (!height && !above) ? { top: anchor.bottom + 4, left, width } : above ? { bottom: window.innerHeight - anchor.top + 4, left, width } : { top: Math.max(8, window.innerHeight - need - 8), left, width }
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className={`popover db-popover ${height ? 'tall' : ''}`} style={style}>
        {children}
      </div>
    </>
  )
}

/** Table layout: rows = the view's (filtered, sorted) rows; columns = the view's visible properties. */
export function TableBody({ db, rows, view, onNewRow, onFilter }: { db: Block; rows: Block[]; view: DbView; onNewRow: () => void; onFilter?: (propId: string) => void }) {
  const dbId = db.id
  const [menu, setMenu] = useState<{ propId: string; rect: DOMRect; edit?: boolean } | null>(null)
  const [dragCol, setDragCol] = useState<string | null>(null)
  const [calc, setCalc] = useState<{ propId: string; rect: DOMRect } | null>(null)
  const [dropRow, setDropRow] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)
  const S = useStore.getState
  const allColumns = db.schema!
  const schema = allColumns.filter((p) => p.type === 'title' || !view.hidden?.includes(p.id))

  // Sub-items: children follow their parent row, indented, behind a toggle (Notion's nested sub-items).
  const [shut, setShut] = useState<Record<string, boolean>>({})
  const ids = new Set(rows.map((r) => r.id))
  const kids = new Map<string, Block[]>()
  for (const r of rows) {
    const p = r.properties.parent_row
    if (p && ids.has(p)) kids.set(p, [...(kids.get(p) ?? []), r])
  }
  const flat: { row: Block; depth: number }[] = []
  const walk = (r: Block, depth: number) => {
    flat.push({ row: r, depth })
    if (!shut[r.id] && depth < 8) for (const k of kids.get(r.id) ?? []) walk(k, depth + 1)
  }
  rows.filter((r) => !r.properties.parent_row || !ids.has(r.properties.parent_row)).forEach((r) => walk(r, 0))
  const addSub = (parent: string) => {
    let id = ''
    S().transact(() => {
      id = S().newDbRow(dbId, undefined)
      S().updateBlock(id, { properties: { parent_row: parent } })
    })
    setShut({ ...shut, [parent]: false })
    return id
  }

  const addProperty = (rect: DOMRect) => {
    const prop: DbProperty = { id: shortId(), name: `Property ${allColumns.length}`, type: 'text' }
    S().updateBlock(dbId, { schema: [...allColumns, prop] })
    setMenu({ propId: prop.id, rect, edit: true })
  }

  return (
    <>
      <div className="db-scroll">
        <table className="db-table">
          <colgroup>
            <col style={{ width: 44 }} />
            {schema.map((p) => (
              <col key={p.id} style={{ width: defaultWidth(p) }} />
            ))}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="db-gutter" />
              {schema.map((p) => (
                <th
                  key={p.id}
                  className={dragCol && dragCol !== p.id ? 'db-th-drop' : ''}
                  onDragOver={(e) => dragCol && e.dataTransfer.types.includes('application/x-db-col') && e.preventDefault()}
                  onDrop={(e) => {
                    // Drag a column header onto another to move it there (Notion reorders columns by dragging).
                    e.preventDefault()
                    const from = e.dataTransfer.getData('application/x-db-col')
                    setDragCol(null)
                    if (!from || from === p.id) return
                    const next = allColumns.filter((c) => c.id !== from)
                    next.splice(next.findIndex((c) => c.id === p.id) + (allColumns.findIndex((c) => c.id === from) < allColumns.findIndex((c) => c.id === p.id) ? 1 : 0), 0, allColumns.find((c) => c.id === from)!)
                    S().updateBlock(dbId, { schema: next })
                  }}
                >
                  <span
                    className="db-col-resize"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      const x0 = e.clientX
                      const w0 = defaultWidth(p)
                      const th = e.currentTarget.closest('table')!.querySelectorAll('col')[schema.indexOf(p) + 1] as HTMLElement
                      let w = w0
                      const move = (m: MouseEvent) => {
                        w = Math.max(60, Math.min(800, w0 + m.clientX - x0))
                        th.style.width = `${w}px`
                      }
                      const up = () => {
                        window.removeEventListener('mousemove', move)
                        window.removeEventListener('mouseup', up)
                        S().updateBlock(dbId, { schema: allColumns.map((c) => (c.id === p.id ? { ...c, width: w } : c)) })
                      }
                      window.addEventListener('mousemove', move)
                      window.addEventListener('mouseup', up)
                    }}
                  />
                  <button
                    className="db-th"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-db-col', p.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragCol(p.id)
                    }}
                    onDragEnd={() => setDragCol(null)}
                    onClick={(e) => setMenu({ propId: p.id, rect: e.currentTarget.getBoundingClientRect() })}
                  >
                    <span className="db-type-icon">{TYPE_ICON[p.type]}</span>
                    <span className="db-th-name">{p.name}</span>
                  </button>
                </th>
              ))}
              <th>
                <button className="db-th db-add-col" title="Add a property" onClick={(e) => addProperty(e.currentTarget.getBoundingClientRect())}>
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {flat.map(({ row, depth }) => (
              <tr
                key={row.id}
                data-row-id={row.id}
                className={dropRow?.id === row.id ? `drop-${dropRow.pos}` : ''}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('application/x-row')) return
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  setDropRow({ id: row.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' })
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const dragged = e.dataTransfer.getData('application/x-row')
                  if (dragged && dragged !== row.id && dropRow) S().moveBlock(dragged, row.id, dropRow.pos)
                  setDropRow(null)
                }}
              >
                <td className="db-gutter">
                  <RowHandle rowId={row.id} view={view} onDragEnd={() => setDropRow(null)} />
                </td>
                {schema.map((p) => (
                  <td key={p.id} className={`db-td db-td-${p.type} ${view.wrap?.includes(p.id) ? 'wrap' : ''}`}>
                    {p.type === 'title' ? (
                      <TitleCell
                        row={row}
                        view={view}
                        depth={depth}
                        hasKids={kids.has(row.id)}
                        open={!shut[row.id]}
                        onToggle={() => setShut({ ...shut, [row.id]: !shut[row.id] })}
                        onAddSub={() => addSub(row.id)}
                      />
                    ) : <WrapCtx.Provider value={!!view.wrap?.includes(p.id)}><Cell prop={p} row={row} dbId={dbId} /></WrapCtx.Provider>}
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="db-new-tr">
              <td className="db-gutter" />
              <td colSpan={schema.length + 1}>
                <button className="db-new-row" onClick={onNewRow}>
                  ＋ New
                </button>
              </td>
            </tr>
            <tr className="db-calc-row">
              <td className="db-gutter" />
              {schema.map((p) => {
                const fn = view.calcs?.[p.id]
                const label = fn && calcLabel(p, fn)
                return (
                  <td key={p.id}>
                    <button className={`db-calc ${label ? 'set' : ''}`} onClick={(e) => setCalc({ propId: p.id, rect: e.currentTarget.getBoundingClientRect() })}>
                      {label ? (
                        <>
                          <span className="db-calc-label">{label.short}</span> {calculate(fn!, p, rows)}
                        </>
                      ) : (
                        <>Calculate <TriangleIcon size={8} /></>
                      )}
                    </button>
                  </td>
                )
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {menu && allColumns.some((p) => p.id === menu.propId) && (
        <PropertyMenu db={db} propId={menu.propId} anchor={menu.rect} onClose={() => setMenu(null)} view={view} onFilter={onFilter} startInEdit={menu.edit} />
      )}
      {calc && allColumns.some((p) => p.id === calc.propId) && (
        <Popover anchor={calc.rect} onClose={() => setCalc(null)} width={220}>
          {[{ value: undefined, label: 'None' }, ...calcOptions(allColumns.find((p) => p.id === calc.propId)!)].map((o) => (
            <div
              key={o.value ?? 'none'}
              className={`menu-item compact ${view.calcs?.[calc.propId] === o.value ? 'active' : ''}`}
              onClick={() => {
                const calcs = { ...view.calcs }
                if (o.value) calcs[calc.propId] = o.value
                else delete calcs[calc.propId]
                S().updateBlock(dbId, { views: getViews(db).map((v) => (v.id === view.id ? { ...v, calcs } : v)) })
                setCalc(null)
              }}
            >
              {o.label}
            </div>
          ))}
        </Popover>
      )}
    </>
  )
}

function TitleCell({ row, view, depth, hasKids, open, onToggle, onAddSub }: {
  row: Block
  view: DbView
  depth: number
  hasKids: boolean
  open: boolean
  onToggle: () => void
  onAddSub: () => void
}) {
  const S = useStore.getState
  return (
    <div className="db-title-cell" style={{ paddingLeft: 6 + depth * 20 }}>
      <button className={`ctl db-sub-toggle ${hasKids ? 'has' : ''} ${open ? 'open' : ''}`} title={hasKids ? (open ? 'Hide sub-items' : 'Show sub-items') : 'Add a sub-item'} onClick={hasKids ? onToggle : onAddSub}>
        {hasKids ? <TriangleIcon size={10} /> : <PlusIcon size={10} />}
      </button>
      {row.format.icon && <span className="db-row-icon">{row.format.icon}</span>}
      <TextInput
        value={row.properties.title}
        placeholder="Untitled"
        onCommit={(v) => S().updateBlock(row.id, { properties: { title: v } })}
      />
      <button className="btn small db-open" onClick={() => openRow(row.id, view)}>
        Open
      </button>
    </div>
  )
}

/**
 * Text input that keeps its own draft while focused and saves on blur / Enter, so live
 * updates from the server don't fight with typing.
 */
function TextInput({
  value,
  onCommit,
  placeholder,
  type = 'text',
  display,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  type?: string
  /** Shown instead of the raw value while not editing (formatted numbers). */
  display?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const editing = useRef(false)
  const wrap = useContext(WrapCtx) && type === 'text'
  useEffect(() => {
    if (!editing.current) setDraft(value)
  }, [value])
  const commit = () => {
    editing.current = false
    setFocused(false)
    if (draft !== value) onCommit(draft)
  }
  const Tag = wrap ? 'textarea' : 'input'
  return (
    <Tag
      className={`db-input ${wrap ? 'wrap' : ''}`}
      rows={wrap ? 1 : undefined}
      type={wrap ? undefined : type}
      value={focused || display === undefined ? draft : display}
      placeholder={placeholder}
      onFocus={() => {
        editing.current = true
        setFocused(true)
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          setDraft(value)
          editing.current = false
          requestAnimationFrame(() => (e.target as HTMLElement).blur())
        }
      }}
    />
  )
}

function safeUrl(v: string) {
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

/** Editor for one non-title cell. Also used on row pages. */
export function Cell({ prop, row, dbId }: { prop: DbProperty; row: Block; dbId: string }) {
  const S = useStore.getState
  const value = row.properties.cells?.[prop.id] ?? null
  const set = (v: CellValue) => S().setCell(row.id, prop.id, v)

  switch (prop.type) {
    case 'checkbox':
      return (
        <label className="db-check">
          <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
        </label>
      )
    case 'number':
      return (
        <TextInput
          value={typeof value === 'number' ? String(value) : ''}
          display={typeof value === 'number' ? formatNumber(value, prop) : ''}
          placeholder="Empty"
          onCommit={(v) => set(parseNumber(v, prop))}
        />
      )
    case 'date': {
      const reminders = row.properties.reminders ?? {}
      return (
        <DateCell
          value={typeof value === 'string' ? value : null}
          onChange={(v) => set(v)}
          prop={prop}
          onFormat={(patch) => updateProperty(dbId, prop.id, patch)}
          remind={reminders[prop.id]}
          onRemind={(m) => {
            const next = { ...reminders }
            if (m === undefined) delete next[prop.id]
            else {
              next[prop.id] = m
              askNotificationPermission()
            }
            S().updateBlock(row.id, { properties: { reminders: next } })
          }}
        />
      )
    }
    case 'url':
      return (
        <div className="db-url">
          <TextInput value={typeof value === 'string' ? value : ''} placeholder="Empty" onCommit={(v) => set(v.trim() || null)} />
          {typeof value === 'string' && value && (
            <a className="ctl" href={safeUrl(value)} target="_blank" rel="noopener noreferrer" title="Open link">
              ↗
            </a>
          )}
        </div>
      )
    case 'created_time':
    case 'last_edited_time':
      return <span className="db-readonly">{String(cellRaw(prop, row) ?? '')}</span>
    case 'status':
    case 'select':
    case 'multi_select':
      return <SelectCell prop={prop} value={value} onChange={set} dbId={dbId} />
    default:
      return <TextInput value={typeof value === 'string' ? value : ''} placeholder="Empty" onCommit={(v) => set(v || null)} />
  }
}

export function Pill({ option, onRemove, dot }: { option: SelectOption; onRemove?: () => void; dot?: boolean }) {
  return (
    <span className={`db-pill opt-${option.color} ${dot ? 'status' : ''}`}>
      {dot && <span className="db-pill-dot" />}
      {option.name}
      {onRemove && (
        <button
          className="db-pill-x"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ×
        </button>
      )}
    </span>
  )
}

function SelectCell({ prop, value, onChange, dbId }: { prop: DbProperty; value: CellValue; onChange: (v: CellValue) => void; dbId: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [query, setQuery] = useState('')
  const multi = prop.type === 'multi_select'
  const options = prop.options ?? []
  const selected: string[] = multi ? (Array.isArray(value) ? value : []) : typeof value === 'string' ? [value] : []
  const chosen = selected.map((id) => options.find((o) => o.id === id)).filter((o): o is SelectOption => !!o)

  const toggle = (id: string) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
    else {
      onChange(selected[0] === id ? null : id)
      setRect(null)
    }
    setQuery('')
  }
  const create = () => {
    const name = query.trim().replace(/,/g, '')
    if (!name) return
    const existing = options.find((o) => o.name.toLowerCase() === name.toLowerCase())
    if (existing) return toggle(existing.id)
    const opt: SelectOption = { id: shortId(), name, color: OPTION_COLORS[1 + Math.floor(Math.random() * (OPTION_COLORS.length - 1))] }
    updateProperty(dbId, prop.id, { options: [...options, opt] })
    toggle(opt.id)
  }
  const q = query.trim().toLowerCase()
  const matches = options.filter((o) => o.name.toLowerCase().includes(q))

  return (
    <>
      <div className="db-select" onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}>
        {chosen.length ? chosen.map((o) => <Pill key={o.id} option={o} dot={prop.type === 'status'} />) : <span className="db-empty">Empty</span>}
      </div>
      {rect && (
        <Popover anchor={rect} onClose={() => { setRect(null); setQuery('') }} width={260}>
          <div className="db-select-box">
            {chosen.map((o) => (
              <Pill key={o.id} option={o} onRemove={() => toggle(o.id)} />
            ))}
            <input
              autoFocus
              className="db-select-search"
              placeholder={options.length ? 'Search or create an option' : 'Type to create an option'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (matches.length && q && matches[0].name.toLowerCase() === q) toggle(matches[0].id)
                  else if (q) create()
                } else if (e.key === 'Backspace' && !query && selected.length) toggle(selected[selected.length - 1])
              }}
            />
          </div>
          <div className="menu-section">{multi ? 'Select options' : 'Select an option'}</div>
          {matches.map((o) => (
            <div key={o.id} className={`menu-item compact ${selected.includes(o.id) ? 'active' : ''}`} onClick={() => toggle(o.id)}>
              <Pill option={o} />
            </div>
          ))}
          {q && !options.some((o) => o.name.toLowerCase() === q) && (
            <div className="menu-item compact" onClick={create}>
              Create <Pill option={{ id: '', name: query.trim(), color: 'gray' }} />
            </div>
          )}
        </Popover>
      )}
    </>
  )
}

function updateProperty(dbId: string, propId: string, patch: Partial<DbProperty>) {
  const S = useStore.getState
  const db = S().blocks[dbId]
  if (!db?.schema) return
  S().updateBlock(dbId, { schema: db.schema.map((p) => (p.id === propId ? { ...p, ...patch } : p)) })
}

/** Convert existing cell values when a property changes type (keeps what still makes sense). */
function convertCells(db: Block, prop: DbProperty, to: PropertyType): { options?: SelectOption[] } {
  const S = useStore.getState
  const rows = dbRows(S().blocks, db)
  const optionName = (id: string) => prop.options?.find((o) => o.id === id)?.name
  const options = [...(prop.options ?? [])]
  const optionFor = (name: string) => {
    let o = options.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!o) {
      o = { id: shortId(), name, color: OPTION_COLORS[1 + (options.length % (OPTION_COLORS.length - 1))] }
      options.push(o)
    }
    return o.id
  }
  for (const row of rows) {
    const v = row.properties.cells?.[prop.id]
    if (v === undefined || v === null) continue
    // Current value as a list of words / names.
    const parts: string[] =
      isSingleChoice(prop.type) ? [optionName(String(v)) ?? ''] :
      prop.type === 'multi_select' ? (Array.isArray(v) ? v.map((id) => optionName(id) ?? '') : []) :
      prop.type === 'checkbox' ? [] :
      String(v).split(',').map((s) => s.trim())
    const text = parts.filter(Boolean).join(', ')
    let next: CellValue = null
    if (to === 'text' || to === 'url') next = text || null
    else if (to === 'number') next = Number.isNaN(parseFloat(text)) ? null : parseFloat(text)
    else if (to === 'checkbox') next = prop.type === 'checkbox' ? v : false
    else if (to === 'date') next = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
    else if (to === 'select' || to === 'status') next = parts[0] ? optionFor(parts[0]) : null
    else if (to === 'multi_select') next = parts.filter(Boolean).map(optionFor)
    S().setCell(row.id, prop.id, next)
  }
  if (to === 'status' && !options.length) options.push(...statusOptions())
  return { options: to === 'select' || to === 'status' || to === 'multi_select' ? options : undefined }
}

/** Where a menu opens under an anchor: below it, kept inside the window. */
export function menuPos(anchor: DOMRect, width = 260): CSSProperties {
  const left = Math.max(8, Math.min(anchor.left, innerWidth - width - 8))
  const below = innerHeight - anchor.bottom > 320
  return below ? { left, top: anchor.bottom + 4, width } : { left, bottom: innerHeight - anchor.top + 4, width, maxHeight: anchor.top - 12 }
}

/** The menu of one select / status option: rename, delete, colour (Notion's option menu). */
function optionMenu(db: Block, prop: DbProperty, o: SelectOption): MenuEntry {
  const set = (options: SelectOption[]) => updateProperty(db.id, prop.id, { options })
  return {
    label: o.name,
    icon: <span className={`db-color-dot opt-${o.color}`} />,
    subWidth: 220,
    subNode: (
      <input
        className="pm-option-name"
        defaultValue={o.name}
        onBlur={(e) => {
          const n = e.target.value.trim()
          if (n && n !== o.name) set(prop.options!.map((x) => (x.id === o.id ? { ...x, name: n } : x)))
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    ),
    sub: [
      { label: 'Delete', icon: 'trash', onClick: () => set(prop.options!.filter((x) => x.id !== o.id)) },
      { kind: 'sep' },
      { kind: 'section', label: 'Colors' },
      ...OPTION_COLORS.map((c): MenuEntry => ({
        label: c === 'default' ? 'Default' : c[0].toUpperCase() + c.slice(1),
        icon: <span className={`db-color-swatch opt-${c}`} />,
        active: o.color === c,
        onClick: () => set(prop.options!.map((x) => (x.id === o.id ? { ...x, color: c } : x))),
      })),
    ],
  }
}

/**
 * Notion's property menu. From a table header (with `view`): name, Edit property, Change type, Filter, Sort,
 * Hide, Wrap content, Insert left / right, Duplicate, Delete. From a row page: name, Edit property, Duplicate,
 * Delete. "Edit property" swaps in the edit panel (type, format, options).
 */
export function PropertyMenu({ db, propId, anchor, onClose, view, onFilter, startInEdit }: {
  db: Block
  propId: string
  anchor: DOMRect
  onClose: () => void
  view?: DbView
  onFilter?: (propId: string) => void
  startInEdit?: boolean
}) {
  const S = useStore.getState
  const prop = db.schema!.find((p) => p.id === propId)!
  const [name, setName] = useState(prop.name)
  const [edit, setEdit] = useState(!!startInEdit)
  const isTitle = prop.type === 'title'
  const saveName = () => name.trim() && name !== prop.name && updateProperty(db.id, propId, { name: name.trim() })
  const close = () => {
    saveName()
    onClose()
  }
  const schema = db.schema!
  const index = schema.findIndex((p) => p.id === propId)
  const setView = (patch: Partial<DbView>) => view && S().updateBlock(db.id, { views: getViews(db).map((v) => (v.id === view.id ? { ...v, ...patch } : v)) })

  const insert = (at: number) => {
    const next = [...schema]
    next.splice(at, 0, { id: shortId(), name: `Property ${schema.length}`, type: 'text' })
    S().updateBlock(db.id, { schema: next })
  }
  const duplicate = () =>
    S().transact(() => {
      const copy: DbProperty = { ...structuredClone(prop), id: shortId(), name: `${prop.name} (1)` }
      const next = [...schema]
      next.splice(index + 1, 0, copy)
      S().updateBlock(db.id, { schema: next })
      for (const row of dbRows(S().blocks, db)) {
        const v = row.properties.cells?.[prop.id]
        if (v !== undefined && v !== null) S().setCell(row.id, copy.id, structuredClone(v))
      }
    })
  const remove = () => S().updateBlock(db.id, { schema: schema.filter((p) => p.id !== propId) })
  const changeType = (to: PropertyType) => {
    if (to === prop.type) return
    const extra = convertCells(db, prop, to)
    updateProperty(db.id, propId, { type: to, ...extra })
  }
  const types: MenuEntry[] = PROPERTY_TYPES.map((t) => ({ label: t.label, icon: <span className="db-type-icon">{t.icon}</span>, active: t.type === prop.type, onClick: () => changeType(t.type) }))
  const typeLabel = isTitle ? 'Title' : PROPERTY_TYPES.find((t) => t.type === prop.type)?.label

  const header = (
    <div className="pm-name">
      <span className="pm-type" title={typeLabel}>{TYPE_ICON[prop.type]}</span>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') close()
        }}
      />
    </div>
  )

  const entries: MenuEntry[] = edit
    ? [
        isTitle
          ? { label: 'Type', icon: 'refresh', value: 'Title', disabled: true }
          : { label: 'Type', icon: 'refresh', value: typeLabel, sub: types },
        ...(prop.type === 'number'
          ? [{ label: 'Number format', icon: 'hash', value: NUMBER_FORMATS.find((f) => f.value === (prop.number_format ?? 'number'))?.label, sub: NUMBER_FORMATS.map((f): MenuEntry => ({ label: f.label, active: (prop.number_format ?? 'number') === f.value, onClick: () => updateProperty(db.id, propId, { number_format: f.value === 'number' ? undefined : f.value }) })) } as MenuEntry]
          : []),
        ...(prop.type === 'date'
          ? ([
              { label: 'Date format', icon: 'calendar', value: DATE_FORMATS.find((f) => f.value === (prop.date_format ?? 'full'))?.label, sub: DATE_FORMATS.map((f): MenuEntry => ({ label: f.label, active: (prop.date_format ?? 'full') === f.value, onClick: () => updateProperty(db.id, propId, { date_format: f.value }) })) },
              { label: 'Time format', icon: 'clock', value: prop.time_format === '24' ? '24 hour' : '12 hour', sub: (['12', '24'] as const).map((f): MenuEntry => ({ label: `${f} hour`, active: (prop.time_format ?? '12') === f, onClick: () => updateProperty(db.id, propId, { time_format: f }) })) },
            ] as MenuEntry[])
          : []),
        ...((isSingleChoice(prop.type) || prop.type === 'multi_select')
          ? ([{ kind: 'sep' }, { kind: 'section', label: 'Options' }, ...(prop.options ?? []).map((o) => optionMenu(db, prop, o)),
              { label: 'Add an option', icon: <PlusIcon />, keepOpen: true, onClick: () => updateProperty(db.id, propId, { options: [...(prop.options ?? []), { id: shortId(), name: `Option ${(prop.options?.length ?? 0) + 1}`, color: OPTION_COLORS[1 + ((prop.options?.length ?? 0) % (OPTION_COLORS.length - 1))] }] }) }] as MenuEntry[])
          : []),
        { kind: 'sep' },
        { label: 'Duplicate property', icon: 'duplicate', onClick: duplicate },
        ...(isTitle ? [] : [{ label: 'Delete property', icon: 'trash', danger: true, onClick: remove } as MenuEntry]),
      ]
    : [
        { label: 'Edit property', icon: 'sliders', keepOpen: true, onClick: () => setEdit(true) },
        ...(!isTitle ? [{ label: 'Change type', icon: 'refresh', value: typeLabel, sub: types } as MenuEntry] : []),
        ...(view
          ? ([
              { kind: 'sep' },
              ...(onFilter ? [{ label: 'Filter', icon: 'filter', onClick: () => onFilter(propId) }] : []),
              { label: 'Sort ascending', icon: 'arrowUp', onClick: () => setView({ sort: [{ property: propId, direction: 'ascending' }] }) },
              { label: 'Sort descending', icon: 'arrowDown', onClick: () => setView({ sort: [{ property: propId, direction: 'descending' }] }) },
              ...(!isTitle ? [{ label: 'Hide', icon: 'eyeOff', onClick: () => setView({ hidden: [...(view.hidden ?? []), propId] }) }] : []),
              {
                label: 'Wrap content',
                icon: 'wrap',
                toggle: !!view.wrap?.includes(propId),
                onClick: () => setView({ wrap: view.wrap?.includes(propId) ? view.wrap.filter((x) => x !== propId) : [...(view.wrap ?? []), propId] }),
              },
              { kind: 'sep' },
              { label: 'Insert left', icon: 'arrowLeft', onClick: () => insert(index) },
              { label: 'Insert right', icon: 'arrowRight', onClick: () => insert(index + 1) },
            ] as MenuEntry[])
          : [{ kind: 'sep' } as MenuEntry]),
        { label: 'Duplicate property', icon: 'duplicate', onClick: duplicate },
        ...(isTitle ? [] : [{ label: 'Delete property', icon: 'trash', danger: true, onClick: remove } as MenuEntry]),
      ]

  return (
    <ActionMenu
      entries={entries}
      onClose={close}
      search={false}
      header={header}
      className="pm-menu"
      style={menuPos(anchor)}
    />
  )
}

/** Property list shown under the title of a page that is a database row. */
export function RowProperties({ rowId }: { rowId: string }) {
  const row = useStore((s) => s.blocks[rowId])
  const db = useStore((s) => (row?.parent_id ? s.blocks[row.parent_id] : undefined))
  const blocks = useStore((s) => s.blocks)
  // Clicking a property name opens its menu (rename, type, options…); "+ Add a property" adds one, like Notion.
  const [menu, setMenu] = useState<{ propId: string; rect: DOMRect; edit?: boolean } | null>(null)
  if (!row || !db?.schema) return null
  const addProperty = (rect: DOMRect) => {
    const prop: DbProperty = { id: shortId(), name: 'Text', type: 'text' }
    useStore.getState().updateBlock(db.id, { schema: [...db.schema!, prop] })
    setMenu({ propId: prop.id, rect, edit: true })
  }
  const parentId = row.properties.parent_row
  const parent = parentId && blocks[parentId]?.alive ? blocks[parentId] : undefined
  const subs = dbRows(blocks, db).filter((r) => r.properties.parent_row === row.id)
  return (
    <div className="row-props">
      {db.schema
        .filter((p) => p.type !== 'title')
        .map((p) => (
          <div key={p.id} className="row-prop">
            <button className="row-prop-name" onClick={(e) => setMenu({ propId: p.id, rect: e.currentTarget.getBoundingClientRect() })}>
              <span className="db-type-icon">{TYPE_ICON[p.type]}</span> {p.name}
            </button>
            <div className={`row-prop-value db-td-${p.type}`}>
              <Cell prop={p} row={row} dbId={db.id} />
            </div>
          </div>
        ))}
      {(parent || subs.length > 0) && (
        <div className="row-prop">
          <span className="row-prop-name"><span className="db-type-icon">↳</span> {parent ? 'Parent item' : 'Sub-items'}</span>
          <div className="row-prop-value row-prop-links">
            {(parent ? [parent] : subs).map((r) => (
              <button key={r.id} className="row-prop-link" onClick={() => useStore.getState().openPage(r.id)}>
                {r.format.icon ?? '📄'} {r.properties.title || 'Untitled'}
              </button>
            ))}
          </div>
        </div>
      )}
      <button className="row-prop-add" onClick={(e) => addProperty(e.currentTarget.getBoundingClientRect())}>
        <PlusIcon size={14} /> Add a property
      </button>
      {menu && db.schema.some((p) => p.id === menu.propId) && <PropertyMenu db={db} propId={menu.propId} anchor={menu.rect} onClose={() => setMenu(null)} startInEdit={menu.edit} />}
    </div>
  )
}

/** Notion's row handles: "+" adds a row below, "⋮⋮" drags to reorder or (click) opens the row menu. */
/** The row menu (⋮⋮ on table / list rows, ⋯ on board cards). */
export function rowMenuEntries(rowId: string): MenuEntry[] {
  const S = useStore.getState
  return [
    { label: 'Open in side peek', icon: 'peek', onClick: () => openRow(rowId) },
    { label: 'Open as full page', icon: 'openFull', onClick: () => S().openPage(rowId) },
    { kind: 'sep' },
    { label: 'Copy link', icon: 'link', onClick: () => navigator.clipboard.writeText(pageUrl(rowId)).then(() => S().showToast({ label: 'Copied link to clipboard' })) },
    { label: 'Duplicate', icon: 'duplicate', kbd: 'Ctrl+D', onClick: () => S().duplicate(rowId) },
    { label: 'Delete', icon: 'trash', kbd: 'Del', danger: true, onClick: () => S().removeBlock(rowId) },
  ]
}

export function RowHandle({ rowId, view, onDragEnd }: { rowId: string; view?: DbView; onDragEnd?: () => void }) {
  const [menu, setMenu] = useState<DOMRect | null>(null)
  const S = useStore.getState
  const addBelow = () => {
    const row = S().blocks[rowId]
    if (!row?.parent_id) return
    let id = ''
    S().transact(() => {
      id = S().newDbRow(row.parent_id!)
      S().moveBlock(id, rowId, 'after')
    })
    openRow(id, view)
  }
  return (
    <span className="db-row-handles">
      <button className="ctl db-row-add" title="Click to add below" onClick={addBelow}>
        <PlusIcon size={14} />
      </button>
      <span
        className="ctl db-row-drag"
        draggable
        title="Drag to move · Click to open menu"
        onDragStart={(e) => e.dataTransfer.setData('application/x-row', rowId)}
        onDragEnd={onDragEnd}
        onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
      >
        <DragIcon size={14} />
      </span>
      {menu && (
        <ActionMenu
          style={{ left: menu.right + 4, top: Math.min(menu.top, innerHeight - 260) }}
          onClose={() => setMenu(null)}
          search={false}
          entries={rowMenuEntries(rowId)}
        />
      )}
    </span>
  )
}
