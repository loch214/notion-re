// Notion's action menus (page ⋯ menu, block ⋮⋮ menu): a "Search actions…" box, rows with an icon,
// label and shortcut, toggles, and submenus that open beside the row on hover. Typing searches
// every row, submenus included.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon, type IconName } from './Icons'

export type MenuEntry =
  | {
      kind?: 'item'
      label: string
      icon?: IconName | ReactNode
      kbd?: string
      /** Extra words that find this row in the search box. */
      keywords?: string
      onClick?: () => void
      /** A switch on the right; clicking the row flips it (onClick does the change). */
      toggle?: boolean
      /** Muted text on the right, before the arrow (e.g. the current value). */
      value?: string
      danger?: boolean
      disabled?: boolean
      title?: string
      active?: boolean
      sub?: MenuEntry[]
      /** Custom content for the submenu (shown above `sub` rows). */
      subNode?: ReactNode
      subWidth?: number
      /** Keep the menu open after clicking (toggles do by default). */
      keepOpen?: boolean
    }
  | { kind: 'sep' }
  | { kind: 'section'; label: string }
  | { kind: 'node'; node: ReactNode }

type Item = Exclude<MenuEntry, { kind: 'sep' | 'section' | 'node' }>
const isItem = (e: MenuEntry): e is Item => !e.kind || e.kind === 'item'

function flatten(entries: MenuEntry[], q: string): Item[] {
  const out: Item[] = []
  for (const e of entries) {
    if (!isItem(e)) continue
    if (!e.sub && `${e.label} ${e.keywords ?? ''}`.toLowerCase().includes(q)) out.push(e)
    if (e.sub) out.push(...flatten(e.sub, q))
  }
  return out
}

function MenuIcon({ icon }: { icon: Item['icon'] }) {
  if (!icon) return null
  return <span className="amenu-icon">{typeof icon === 'string' && !/[^\w]/.test(icon) ? <Icon name={icon as IconName} size={16} /> : icon}</span>
}

function Rows({ entries, onClose, active, setActive, openSub }: { entries: MenuEntry[]; onClose: () => void; active?: number; setActive?: (i: number) => void; openSub: (e: Item | null, el?: HTMLElement) => void }) {
  let n = -1
  return (
    <>
      {entries.map((e, i) => {
        if (e.kind === 'sep') return <div key={i} className="amenu-sep" />
        if (e.kind === 'section') return <div key={i} className="amenu-section">{e.label}</div>
        if (e.kind === 'node') return <div key={i}>{e.node}</div>
        const idx = ++n
        return (
          <div
            key={i}
            className={`amenu-item ${e.danger ? 'danger' : ''} ${e.disabled ? 'disabled' : ''} ${idx === active || e.active ? 'active' : ''}`}
            title={e.title}
            role="menuitem"
            onMouseEnter={(ev) => {
              setActive?.(idx)
              openSub(e.sub || e.subNode ? e : null, ev.currentTarget)
            }}
            onClick={(ev) => {
              if (e.disabled) return
              if (e.sub || e.subNode) return openSub(e, ev.currentTarget)
              e.onClick?.()
              if (e.toggle === undefined && !e.keepOpen) onClose()
            }}
          >
            <MenuIcon icon={e.icon} />
            <span className="amenu-label">{e.label}</span>
            {e.value && <span className="amenu-value">{e.value}</span>}
            {e.kbd && <kbd>{e.kbd}</kbd>}
            {e.toggle !== undefined && <span className={`switch ${e.toggle ? 'on' : ''}`} />}
            {(e.sub || e.subNode) && <Icon name="right" size={14} className="amenu-arrow" />}
          </div>
        )
      })}
    </>
  )
}

/** Place a submenu beside its row, flipping left when there's no room on the right. */
function SubMenu({ item, anchor, onClose, onEnter }: { item: Item; anchor: DOMRect; onClose: () => void; onEnter: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ left: anchor.right + 4, top: anchor.top - 6, visibility: 'hidden' })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = anchor.right + 4 + w > innerWidth - 8 ? Math.max(8, anchor.left - w - 4) : anchor.right + 4
    const top = Math.max(8, Math.min(anchor.top - 6, innerHeight - h - 8))
    setStyle({ left, top })
  }, [anchor, item])
  return (
    <div ref={ref} className="popover amenu amenu-sub" style={{ ...style, width: item.subWidth ?? 240 }} onMouseEnter={onEnter} onMouseDown={(e) => e.stopPropagation()}>
      {item.subNode}
      {item.sub && <Rows entries={item.sub} onClose={onClose} openSub={() => {}} />}
    </div>
  )
}

export function ActionMenu({
  entries,
  onClose,
  className = '',
  style,
  footer,
  search = 'Search actions…',
  header,
}: {
  entries: MenuEntry[]
  onClose: () => void
  className?: string
  style?: CSSProperties
  footer?: ReactNode
  search?: string | false
  header?: ReactNode
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(-1)
  const [sub, setSub] = useState<{ item: Item; rect: DOMRect } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const query = q.trim().toLowerCase()
  const found = query ? flatten(entries, query) : null
  const list: MenuEntry[] = found ?? entries
  const items = list.filter(isItem)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const openSub = (e: Item | null, el?: HTMLElement) => {
    clearTimeout(closeTimer.current)
    if (!e) return (closeTimer.current = setTimeout(() => setSub(null), 120)), undefined
    if (sub?.item === e) return
    setSub({ item: e, rect: el!.getBoundingClientRect() })
  }

  return (
    <>
      <div className="backdrop" onMouseDown={onClose} />
      <div className={`popover amenu ${className}`} style={style} onMouseLeave={() => sub && openSub(null)}>
        {header}
        {search !== false && (
          <div className="amenu-search">
            <Icon name="search" size={14} />
            <input
              autoFocus
              placeholder={search}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setActive(e.target.value.trim() ? 0 : -1)
                setSub(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1))
                else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
                else if (e.key === 'Enter' && items[active]) {
                  const it = items[active]
                  if (it.disabled || it.sub) return
                  it.onClick?.()
                  if (it.toggle === undefined && !it.keepOpen) onClose()
                } else return
                e.preventDefault()
              }}
            />
          </div>
        )}
        {found && !found.length ? <div className="amenu-empty">No results</div> : <Rows entries={list} onClose={onClose} active={active} setActive={setActive} openSub={openSub} />}
        {footer && !found && <div className="amenu-footer">{footer}</div>}
      </div>
      {sub && <SubMenu item={sub.item} anchor={sub.rect} onClose={onClose} onEnter={() => clearTimeout(closeTimer.current)} />}
    </>
  )
}

/** "Last edited" footer with the editor's name and time (Notion shows it under page and block menus). */
export function EditedFooter({ name, time, extra }: { name: string; time: number; extra?: string }) {
  return (
    <>
      <div>Last edited</div>
      <div className="amenu-footer-name">{name || 'You'}</div>
      <div>{new Date(time).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      {extra && <div>{extra}</div>}
    </>
  )
}
