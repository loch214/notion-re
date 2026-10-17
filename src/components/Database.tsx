// Database table view (full-page database) and the property editors shared with row pages.
// Model: the database is a page with a `schema`; each row is a child page whose cell
// values live in `properties.cells[propertyId]`.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { dbRows, OPTION_COLORS, PROPERTY_TYPES, shortId } from '../../shared/blocks.ts'
import { useStore } from '../store'
import type { Block, CellValue, DbProperty, DbView, PropertyType, SelectOption } from '../types'

export const TYPE_ICON: Record<PropertyType, string> = {
  title: 'Aa',
  ...Object.fromEntries(PROPERTY_TYPES.map((t) => [t.type, t.icon])),
} as Record<PropertyType, string>

const defaultWidth = (p: DbProperty) => p.width ?? (p.type === 'title' ? 260 : p.type === 'checkbox' ? 90 : 180)

/** Floating panel under an anchor element, closed by clicking outside or Escape. */
export function Popover({ anchor, onClose, children, width = 240 }: { anchor: DOMRect; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const left = Math.min(anchor.left, window.innerWidth - width - 12)
  const below = window.innerHeight - anchor.bottom > 300
  const style = below ? { top: anchor.bottom + 4, left, width } : { bottom: window.innerHeight - anchor.top + 4, left, width }
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="popover db-popover" style={style}>
        {children}
      </div>
    </>
  )
}

/** Table layout: rows = the view's (filtered, sorted) rows; columns = the view's visible properties. */
export function TableBody({ db, rows, view, onNewRow }: { db: Block; rows: Block[]; view: DbView; onNewRow: () => void }) {
  const dbId = db.id
  const [menu, setMenu] = useState<{ propId: string; rect: DOMRect } | null>(null)
  const S = useStore.getState
  const allColumns = db.schema!
  const schema = allColumns.filter((p) => p.type === 'title' || !view.hidden?.includes(p.id))

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
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="db-gutter">
                  <button className="ctl db-row-del" title="Delete row" onClick={() => S().removeBlock(row.id)}>
                    🗑
                  </button>
                </td>
                {schema.map((p) => (
                  <td key={p.id} className={`db-td db-td-${p.type}`}>
                    {p.type === 'title' ? <TitleCell row={row} /> : <Cell prop={p} row={row} dbId={dbId} />}
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="db-new-row" onClick={onNewRow}>
        ＋ New
      </button>
      {menu && allColumns.some((p) => p.id === menu.propId) && (
        <PropertyMenu db={db} propId={menu.propId} anchor={menu.rect} onClose={() => setMenu(null)} />
      )}
    </>
  )
}

function TitleCell({ row }: { row: Block }) {
  const S = useStore.getState
  return (
    <div className="db-title-cell">
      <span className="db-row-icon">{row.format.icon ?? '📄'}</span>
      <TextInput
        value={row.properties.title}
        placeholder="Untitled"
        onCommit={(v) => S().updateBlock(row.id, { properties: { title: v } })}
      />
      <button className="btn small db-open" onClick={() => S().openPage(row.id)}>
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
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  type?: string
}) {
  const [draft, setDraft] = useState(value)
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current) setDraft(value)
  }, [value])
  const commit = () => {
    editing.current = false
    if (draft !== value) onCommit(draft)
  }
  return (
    <input
      className="db-input"
      type={type}
      value={draft}
      placeholder={placeholder}
      onFocus={() => (editing.current = true)}
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
          placeholder="Empty"
          onCommit={(v) => {
            const n = parseFloat(v.replace(/,/g, ''))
            set(v.trim() === '' || Number.isNaN(n) ? null : n)
          }}
        />
      )
    case 'date':
      return <input className="db-input" type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value || null)} />
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
    case 'select':
    case 'multi_select':
      return <SelectCell prop={prop} value={value} onChange={set} dbId={dbId} />
    default:
      return <TextInput value={typeof value === 'string' ? value : ''} placeholder="Empty" onCommit={(v) => set(v || null)} />
  }
}

export function Pill({ option, onRemove }: { option: SelectOption; onRemove?: () => void }) {
  return (
    <span className={`db-pill opt-${option.color}`}>
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
        {chosen.length ? chosen.map((o) => <Pill key={o.id} option={o} />) : <span className="db-empty">Empty</span>}
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
      prop.type === 'select' ? [optionName(String(v)) ?? ''] :
      prop.type === 'multi_select' ? (Array.isArray(v) ? v.map((id) => optionName(id) ?? '') : []) :
      prop.type === 'checkbox' ? [] :
      String(v).split(',').map((s) => s.trim())
    const text = parts.filter(Boolean).join(', ')
    let next: CellValue = null
    if (to === 'text' || to === 'url') next = text || null
    else if (to === 'number') next = Number.isNaN(parseFloat(text)) ? null : parseFloat(text)
    else if (to === 'checkbox') next = prop.type === 'checkbox' ? v : false
    else if (to === 'date') next = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
    else if (to === 'select') next = parts[0] ? optionFor(parts[0]) : null
    else if (to === 'multi_select') next = parts.filter(Boolean).map(optionFor)
    S().setCell(row.id, prop.id, next)
  }
  return { options: to === 'select' || to === 'multi_select' ? options : undefined }
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
      {(prop.type === 'select' || prop.type === 'multi_select') && !!prop.options?.length && (
        <>
          <div className="menu-section">Options (click the dot to change colour)</div>
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
              <Pill option={o} />
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
  if (!row || !db?.schema) return null
  return (
    <div className="row-props">
      {db.schema
        .filter((p) => p.type !== 'title')
        .map((p) => (
          <div key={p.id} className="row-prop">
            <span className="row-prop-name">
              <span className="db-type-icon">{TYPE_ICON[p.type]}</span> {p.name}
            </span>
            <div className={`row-prop-value db-td-${p.type}`}>
              <Cell prop={p} row={row} dbId={db.id} />
            </div>
          </div>
        ))}
    </div>
  )
}
