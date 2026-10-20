// Database table view (full-page database) and the property editors shared with row pages.
// Model: the database is a page with a `schema`; each row is a child page whose cell
// values live in `properties.cells[propertyId]`.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DateCell } from './DatePicker'
import { openRow } from './Peek'
import { PlusIcon, TriangleIcon } from './Icons'
import { askNotificationPermission } from '../reminders'
import { cellRaw, dbRows, isSingleChoice, OPTION_COLORS, PROPERTY_TYPES, shortId, statusOptions } from '../../shared/blocks.ts'
import { isDateValue } from '../../shared/dates.ts'
import { calcLabel, calcOptions, calculate, formatNumber, NUMBER_FORMATS, parseNumber } from '../../shared/calc.ts'
import { getViews } from '../../shared/views.ts'
import { useStore } from '../store'
import type { Block, CellValue, DbProperty, DbView, PropertyType, SelectOption } from '../types'

export const TYPE_ICON: Record<PropertyType, string> = {
  title: 'Aa',
  ...Object.fromEntries(PROPERTY_TYPES.map((t) => [t.type, t.icon])),
} as Record<PropertyType, string>

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
export function TableBody({ db, rows, view, onNewRow }: { db: Block; rows: Block[]; view: DbView; onNewRow: () => void }) {
  const dbId = db.id
  const [menu, setMenu] = useState<{ propId: string; rect: DOMRect } | null>(null)
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
    setMenu({ propId: prop.id, rect })
  }

  return (
    <>
      <div className="db-scroll">
        <table className="db-table">
          <colgroup>
            <col style={{ width: 28 }} />
            {schema.map((p) => (
              <col key={p.id} style={{ width: defaultWidth(p) }} />
            ))}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="db-gutter" />
              {schema.map((p) => (
                <th key={p.id}>
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
                  <button className="db-th" onClick={(e) => setMenu({ propId: p.id, rect: e.currentTarget.getBoundingClientRect() })}>
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
                  <span
                    className="ctl db-row-drag"
                    draggable
                    title="Drag to reorder"
                    onDragStart={(e) => e.dataTransfer.setData('application/x-row', row.id)}
                    onDragEnd={() => setDropRow(null)}
                  >
                    ⋮⋮
                  </span>
                  <button className="ctl db-row-del" title="Delete row" onClick={() => S().removeBlock(row.id)}>
                    🗑
                  </button>
                </td>
                {schema.map((p) => (
                  <td key={p.id} className={`db-td db-td-${p.type}`}>
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
                    ) : <Cell prop={p} row={row} dbId={dbId} />}
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
        <PropertyMenu db={db} propId={menu.propId} anchor={menu.rect} onClose={() => setMenu(null)} />
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
  useEffect(() => {
    if (!editing.current) setDraft(value)
  }, [value])
  const commit = () => {
    editing.current = false
    setFocused(false)
    if (draft !== value) onCommit(draft)
  }
  return (
    <input
      className="db-input"
      type={type}
      value={focused || display === undefined ? draft : display}
      placeholder={placeholder}
      onFocus={() => {
        editing.current = true
        setFocused(true)
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          editing.current = false
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
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

function PropertyMenu({ db, propId, anchor, onClose }: { db: Block; propId: string; anchor: DOMRect; onClose: () => void }) {
  const S = useStore.getState
  const prop = db.schema!.find((p) => p.id === propId)!
  const [name, setName] = useState(prop.name)
  const isTitle = prop.type === 'title'
  const saveName = () => name.trim() && name !== prop.name && updateProperty(db.id, propId, { name: name.trim() })

  const move = (d: -1 | 1) => {
    const schema = [...db.schema!]
    const i = schema.findIndex((p) => p.id === propId)
    const j = i + d
    if (j < 0 || j >= schema.length) return
    ;[schema[i], schema[j]] = [schema[j], schema[i]]
    S().updateBlock(db.id, { schema })
  }

  return (
    <Popover anchor={anchor} onClose={() => { saveName(); onClose() }}>
      <input
        autoFocus
        className="db-prop-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            saveName()
            onClose()
          }
        }}
      />
      {!isTitle && (
        <>
          <div className="menu-section">Type</div>
          {PROPERTY_TYPES.map((t) => (
            <div
              key={t.type}
              className={`menu-item compact ${t.type === prop.type ? 'active' : ''}`}
              onClick={() => {
                if (t.type === prop.type) return
                const extra = convertCells(db, prop, t.type)
                updateProperty(db.id, propId, { type: t.type, ...extra })
              }}
            >
              <span className="db-type-icon">{t.icon}</span> {t.label}
            </div>
          ))}
        </>
      )}
      {prop.type === 'number' && (
        <>
          <div className="menu-section">Number format</div>
          <select
            className="db-number-format"
            value={prop.number_format ?? 'number'}
            onChange={(e) => updateProperty(db.id, propId, { number_format: e.target.value === 'number' ? undefined : (e.target.value as DbProperty['number_format']) })}
          >
            {NUMBER_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </>
      )}
      {(isSingleChoice(prop.type) || prop.type === 'multi_select') && !!prop.options?.length && (
        <>
          <div className="menu-section">Options (rename, or click the dot to change colour)</div>
          {prop.options.map((o) => (
            <div key={o.id} className="menu-item compact db-option-row">
              <button
                className={`db-color-dot opt-${o.color}`}
                title="Change colour"
                onClick={() => {
                  const next = OPTION_COLORS[(OPTION_COLORS.indexOf(o.color) + 1) % OPTION_COLORS.length]
                  updateProperty(db.id, propId, { options: prop.options!.map((x) => (x.id === o.id ? { ...x, color: next } : x)) })
                }}
              />
              <input
                className="db-option-name"
                defaultValue={o.name}
                onBlur={(e) => {
                  const n = e.target.value.trim()
                  if (n && n !== o.name) updateProperty(db.id, propId, { options: prop.options!.map((x) => (x.id === o.id ? { ...x, name: n } : x)) })
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span style={{ flex: 1 }} />
              <button
                className="ctl"
                title="Delete option"
                onClick={() => updateProperty(db.id, propId, { options: prop.options!.filter((x) => x.id !== o.id) })}
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}
      <div className="menu-section">Actions</div>
      <div className="menu-item compact" onClick={() => move(-1)}>← Move left</div>
      <div className="menu-item compact" onClick={() => move(1)}>→ Move right</div>
      {!isTitle && (
        <div
          className="menu-item compact danger"
          onClick={() => {
            S().updateBlock(db.id, { schema: db.schema!.filter((p) => p.id !== propId) })
            onClose()
          }}
        >
          🗑 Delete property
        </div>
      )}
    </Popover>
  )
}

/** Property list shown under the title of a page that is a database row. */
export function RowProperties({ rowId }: { rowId: string }) {
  const row = useStore((s) => s.blocks[rowId])
  const db = useStore((s) => (row?.parent_id ? s.blocks[row.parent_id] : undefined))
  const blocks = useStore((s) => s.blocks)
  // Clicking a property name opens its menu (rename, type, options…); "+ Add a property" adds one, like Notion.
  const [menu, setMenu] = useState<{ propId: string; rect: DOMRect } | null>(null)
  if (!row || !db?.schema) return null
  const addProperty = (rect: DOMRect) => {
    const prop: DbProperty = { id: shortId(), name: 'Text', type: 'text' }
    useStore.getState().updateBlock(db.id, { schema: [...db.schema!, prop] })
    setMenu({ propId: prop.id, rect })
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
      {menu && db.schema.some((p) => p.id === menu.propId) && <PropertyMenu db={db} propId={menu.propId} anchor={menu.rect} onClose={() => setMenu(null)} />}
    </div>
  )
}
