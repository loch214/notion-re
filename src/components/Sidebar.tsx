import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { markdownToBlocks } from '../markdown'
import { HOME_ID, isScreen, LIBRARY_ID, pageTitle, useStore } from '../store'
import { Icon, PlusIcon, TriangleIcon } from './Icons'
import { Avatar, initials, useProfile } from '../profile'
import { addDays, formatDay, todayIso } from '../../shared/dates'
import { upcoming } from '../../shared/home'
import { ActionMenu, EditedFooter } from './Menu'
import { copyPageLink, MovePageModal, toggleFavorite } from './PageMenu'
import { openRow } from './Peek'
import { getProfileName } from '../profile'
import { useUnreadCount } from './Inbox'

interface Props {
  open?: boolean
  onSearch: () => void
  onSettings: (tab?: 'account' | 'sidebar') => void
  onShortcuts: () => void
  onTrash: () => void
  onAI: () => void
  onInbox: () => void
  onTemplates: () => void
  onCollapse: () => void
}

const RECENT_KEY = 'notion-re:recent-pages'
const WIDTH_KEY = 'notion-re:sidebar-width'

/** Settings → Sidebar: which optional sections to hide (kept in this browser). */
export interface SidebarPrefs {
  upcoming?: boolean
  recent?: boolean
  inbox?: boolean
}
const PREFS_KEY = 'notion-re:sidebar-hide'
const prefListeners = new Set<() => void>()
let prefCache: SidebarPrefs | null = null
export function getSidebarPrefs(): SidebarPrefs {
  if (!prefCache) {
    try {
      prefCache = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    } catch {
      prefCache = {}
    }
  }
  return prefCache!
}
export function setSidebarPrefs(p: SidebarPrefs) {
  prefCache = p
  localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  prefListeners.forEach((l) => l())
}
export function useSidebarPrefs() {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    prefListeners.add(l)
    return () => void prefListeners.delete(l)
  }, [])
  return getSidebarPrefs()
}

const VISITED_KEY = 'notion-re:visited'
/** When each page was last opened (Library's "Last visited time"). */
export function readVisited(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(VISITED_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Recently opened page ids, newest first (also used by Home). */
export function readRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

function useRecents(current: string | null) {
  const [ids, setIds] = useState<string[]>(readRecents)
  useEffect(() => {
    if (!current || isScreen(current)) return
    localStorage.setItem(VISITED_KEY, JSON.stringify({ ...readVisited(), [current]: Date.now() }))
    setIds((old) => {
      const next = [current, ...old.filter((i) => i !== current)].slice(0, 12)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      return next
    })
  }, [current])
  return ids
}

/** Each .md file becomes a new top-level page; the first "# Heading" is the title. */
export async function importMarkdown(files: FileList) {
  const S = useStore.getState
  for (const file of Array.from(files)) {
    let md = await file.text()
    let title = file.name.replace(/\.(md|markdown|txt)$/i, '')
    const h1 = /^#\s+(.+)\r?\n?/.exec(md)
    if (h1) {
      title = h1[1].trim()
      md = md.slice(h1[0].length)
    }
    S().transact(() => {
      const page = S().createPage(null, title)
      const stack: string[] = []
      for (const spec of markdownToBlocks(md)) {
        const depth = Math.min(spec.depth, stack.length)
        const id = S().insertBlock({ parent: depth ? stack[depth - 1] : page, type: spec.type, title: spec.title })
        if (spec.checked) S().updateBlock(id, { properties: { checked: true } })
        if (spec.language) S().updateBlock(id, { format: { code_language: { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', cpp: 'c++', csharp: 'c#' }[spec.language] ?? spec.language } })
        stack[depth] = id
        stack.length = depth + 1
      }
      S().openPage(page)
    })
  }
}

export function Sidebar({ open = true, onSearch, onSettings, onTrash, onAI, onInbox, onTemplates, onCollapse, onShortcuts }: Props) {
  const unread = useUnreadCount()
  const rootPages = useStore((s) => s.rootPages)
  const blocks = useStore((s) => s.blocks)
  const createPage = useStore((s) => s.createPage)
  const current = useStore((s) => s.currentPageId)
  const { name, email } = useProfile()
  const prefs = useSidebarPrefs()
  const [profileMenu, setProfileMenu] = useState(false)
  const today = todayIso()
  const dayLabel = (d: string) => (d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : formatDay(d, 'relative'))
  const events = prefs.upcoming ? [] : upcoming(blocks, 7).slice(0, 3)
  const recents = useRecents(current)
    .filter((id) => blocks[id]?.alive && blocks[id].type === 'page')
    .slice(0, 5)
  const [width, setWidth] = useState(() => Math.min(480, Math.max(200, +(localStorage.getItem(WIDTH_KEY) ?? 240))))
  const [shut, setShut] = useState<Record<string, boolean>>({})
  // Dragging the edge must follow the mouse, so the open / close animation is off meanwhile.
  const [resizing, setResizing] = useState(false)
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(true)
    const move = (m: MouseEvent) => setWidth(Math.min(480, Math.max(200, m.clientX)))
    const up = (m: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setResizing(false)
      localStorage.setItem(WIDTH_KEY, String(Math.min(480, Math.max(200, m.clientX))))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  // Favorites: every live page with the star, by title (when it was starred is not stored).
  const favorites = Object.values(blocks)
    .filter((b) => b.type === 'page' && b.alive && b.format.favorite)
    .sort((a, b) => pageTitle(a).localeCompare(pageTitle(b)))
    .map((b) => b.id)

  // A section header that hides its list when clicked, like Notion's.
  const section = (key: string, label: string, extra?: React.ReactNode) => (
    <div className="side-section">
      <button className="side-section-label" onClick={() => setShut({ ...shut, [key]: !shut[key] })}>
        {label}
      </button>
      {extra}
    </div>
  )

  return (
    // Like Notion, closing / opening the sidebar animates its width (0.2s ease) and the page follows.
    <div className={`sidebar-dock ${resizing ? 'resizing' : ''}`} style={{ width: open ? width : 0 }} aria-hidden={!open}>
    <aside className="sidebar" style={{ width }}>
      <div className="side-resizer" onMouseDown={startResize} />
      <div className="ws-header">
        <button className="ctl ws-ctl ws-logo" title={name ? `${name}'s Notion` : 'Notion(RE)'} onClick={() => onSettings('account')}>
          <span className="ws-logo-mark">{initials(name)}</span>
        </button>
        <button className="ctl ws-ctl" title="Close sidebar (Ctrl+\\)" onClick={onCollapse}>
          <Icon name="sidebar" size={18} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="ctl ws-ctl ws-inbox" title="Inbox" onClick={onInbox}>
          <Icon name="inbox" size={18} />
          {unread > 0 && <span className="ws-dot" />}
        </button>
        <button className="ctl ws-ctl" title="New page (Ctrl+N)" onClick={() => createPage(null)}>
          <Icon name="compose" size={18} />
        </button>
      </div>
      <button className="side-search" onClick={onSearch}>
        <span>Search or ask</span>
        <kbd>Ctrl+K</kbd>
      </button>
      <nav className="side-actions">
        <button className={`side-item side-home ${current === HOME_ID ? 'active' : ''}`} onClick={() => useStore.getState().openPage(HOME_ID)}>
          <span className="side-ic"><Icon name="home" /></span> Home
        </button>
        <button className="side-item" onClick={onAI}>
          <span className="side-ic"><Icon name="chat" /></span> New chat
        </button>
        <button className={`side-item ${current === LIBRARY_ID ? 'active' : ''}`} onClick={() => useStore.getState().openPage(LIBRARY_ID)}>
          <span className="side-ic"><Icon name="library" /></span> Library
        </button>
        {!prefs.inbox && (
          <button className="side-item" onClick={onInbox}>
            <span className="side-ic"><Icon name="inbox" /></span> Inbox
            {unread > 0 && <span className="side-badge">{unread}</span>}
          </button>
        )}
      </nav>

      <div className="side-scroll">
        {!prefs.upcoming && (
          <>
            {section('upcoming', 'Upcoming events')}
            {!shut.upcoming && (
              <div className="tree">
                {events.length === 0 && <div className="side-empty">No upcoming events</div>}
                {events.map((e) => (
                  <button key={e.row.id + e.prop.id} className="side-item side-event" onClick={() => useStore.getState().openPage(e.row.id)}>
                    <span className="side-cal">{new Date(e.day + 'T00:00').getDate()}</span>
                    <span className="side-event-text">
                      <span className="side-event-title">{pageTitle(e.row)}</span>
                      <span className="side-event-meta">{dayLabel(e.day)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {!prefs.recent && recents.length > 0 && (
          <>
            {section('recent', 'Recents')}
            {!shut.recent && (
              <div className="tree tree-favorites">
                {recents.map((id) => (
                  <RecentItem key={id} id={id} />
                ))}
              </div>
            )}
          </>
        )}

        {favorites.length > 0 && (
          <>
            {section('favorites', 'Favorites')}
            {!shut.favorites && (
              <div className="tree tree-favorites">
                {favorites.map((id) => (
                  <TreeItem key={id} id={id} depth={0} />
                ))}
              </div>
            )}
          </>
        )}

        {section(
          'private',
          'Private',
          <span className="side-section-actions">
            <button className="ctl" title="New database" onClick={() => useStore.getState().createDatabase({ parent: null })}>
              <Icon name="template" size={14} />
            </button>
            <button className="ctl" title="Add a page" onClick={() => createPage(null)}>
              <PlusIcon />
            </button>
          </span>,
        )}
        {!shut.private && (
          <div className="tree">
            {rootPages
              .filter((id) => blocks[id]?.alive)
              .map((id) => (
                <TreeItem key={id} id={id} depth={0} />
              ))}
            <button className="side-item muted" onClick={() => createPage(null)}>
              <span className="side-ic"><PlusIcon /></span> New page
            </button>
          </div>
        )}
      </div>

      <div className="side-bottom">
        <button className="side-item muted" onClick={onTemplates}>
          <span className="side-ic"><Icon name="template" /></span> Templates
        </button>
        <button className="side-item muted" onClick={onTrash}>
          <span className="side-ic"><Icon name="trash" /></span> Trash
        </button>
        <button className="side-item muted" onClick={() => onSettings('sidebar')}>
          <span className="side-ic"><Icon name="sliders" /></span> Customize sidebar
        </button>
      </div>
      <div className="side-footer">
        <button className="side-profile" onClick={() => setProfileMenu(!profileMenu)}>
          <Avatar className="small" />
          <span className="side-profile-name">{name || 'Notion(RE)'}</span>
          <Icon name="down" size={12} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="ctl ws-ctl" title="Settings (Ctrl+,)" onClick={() => onSettings()}>
          <Icon name="gear" size={18} />
        </button>
        <button className="ctl ws-ctl" title="Help & keyboard shortcuts" onClick={onShortcuts}>
          <Icon name="question" size={18} />
        </button>
        {profileMenu && (
          <ActionMenu
            className="profile-menu"
            search={false}
            onClose={() => setProfileMenu(false)}
            header={<div className="profile-menu-head">{email || 'On this computer only'}</div>}
            entries={[
              { label: name ? `${name}'s Notion` : 'Notion(RE)', icon: <Avatar className="small" />, onClick: () => onSettings('account') },
              { kind: 'sep' },
              { label: 'Settings', icon: 'gear', kbd: 'Ctrl+,', onClick: () => onSettings() },
              { label: 'Import', icon: 'import', onClick: pickImport },
              { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: 'Ctrl+Alt+/', onClick: onShortcuts },
            ]}
          />
        )}
      </div>
    </aside>
    </div>
  )
}

function pickImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,.markdown,.txt'
  input.multiple = true
  input.onchange = () => input.files?.length && importMarkdown(input.files)
  input.click()
}


function RecentItem({ id }: { id: string }) {
  const page = useStore((s) => s.blocks[id])
  const current = useStore((s) => s.currentPageId)
  return (
    <div className={`tree-item ${current === id ? 'active' : ''}`} style={{ paddingLeft: 8 }} onClick={() => useStore.getState().openPage(id)}>
      <span className="tree-arrow">
        <span className="tree-icon">{page.format.icon ?? <Icon name="page" size={17} />}</span>
      </span>
      <span className="tree-title">{pageTitle(page)}</span>
    </div>
  )
}

function TreeItem({ id, depth }: { id: string; depth: number }) {
  const page = useStore((s) => s.blocks[id])
  const blocks = useStore((s) => s.blocks)
  const current = useStore((s) => s.currentPageId)
  const [open, setOpen] = useState(false)
  const [drop, setDrop] = useState<'before' | 'after' | 'inside' | null>(null)
  // Notion's "⋯" on a sidebar page: favourite, copy link, duplicate, rename, move, peek, trash.
  const [menu, setMenu] = useState<DOMRect | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [moving, setMoving] = useState(false)
  const S = useStore.getState

  // A database's child pages are its rows; like Notion, they don't appear in the tree.
  const childPages = page.schema ? [] : page.content.filter((c) => blocks[c]?.alive && blocks[c].type === 'page')

  return (
    <>
      <div
        className={`tree-item ${current === id ? 'active' : ''} ${drop ? `drop-${drop}` : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-page', id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('application/x-page')) return
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const y = (e.clientY - r.top) / r.height
          setDrop(page.schema ? (y < 0.5 ? 'before' : 'after') : y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside')
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          e.preventDefault()
          const dragged = e.dataTransfer.getData('application/x-page')
          if (dragged && drop) {
            S().placePage(dragged, id, drop)
            if (drop === 'inside') setOpen(true)
          }
          setDrop(null)
        }}
        onClick={(e) => (e.altKey ? openRow(id) : S().openPage(id))}
      >
        {/* Like Notion: the page icon turns into the expand arrow while you hover the row. */}
        <button
          className="tree-arrow"
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(!open)
          }}
        >
          <span className="tree-icon">{page.format.icon ?? <Icon name="page" size={17} />}</span>
          <span className={`tree-tri ${open ? 'open' : ''}`}>
            <TriangleIcon />
          </span>
        </button>
        {renaming ? (
          <input
            className="tree-rename"
            autoFocus
            defaultValue={page.properties.title}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              S().updateBlock(id, { properties: { title: e.currentTarget.value } })
              setRenaming(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <span className="tree-title">{pageTitle(page)}</span>
        )}
        <span className={`tree-actions ${menu ? 'on' : ''}`}>
          <button
            className="ctl"
            title="Delete, duplicate, and more…"
            onClick={(e) => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              setMenu(r.width ? r : e.currentTarget.closest('.tree-item')!.getBoundingClientRect())
            }}
          >
            <Icon name="more" size={15} />
          </button>
          <button
            className="ctl"
            title="Add a page inside"
            onClick={(e) => {
              e.stopPropagation()
              S().openPage(S().insertBlock({ parent: id, type: 'page' }))
              setOpen(true)
            }}
          >
            <PlusIcon />
          </button>
        </span>
      </div>
      {menu && createPortal(
        <ActionMenu
          className="tree-menu"
          style={{ left: menu.left, top: Math.min(menu.bottom + 4, innerHeight - 340) }}
          onClose={() => setMenu(null)}
          search={false}
          entries={[
            { label: page.format.favorite ? 'Remove from Favorites' : 'Add to Favorites', icon: 'star', onClick: () => toggleFavorite(id) },
            { kind: 'sep' },
            { label: 'Copy link', icon: 'link', onClick: () => copyPageLink(id) },
            { label: 'Duplicate', icon: 'duplicate', kbd: 'Ctrl+D', onClick: () => S().duplicate(id) },
            { label: 'Rename', icon: 'pencil', kbd: 'Ctrl+Shift+R', onClick: () => setRenaming(true) },
            { label: 'Move to', icon: 'moveTo', kbd: 'Ctrl+Shift+P', onClick: () => setMoving(true) },
            { label: 'Move to Trash', icon: 'trash', danger: true, onClick: () => S().removeBlock(id) },
            { kind: 'sep' },
            { label: 'Open in side peek', icon: 'peek', kbd: 'Alt+Click', onClick: () => openRow(id) },
          ]}
          footer={<EditedFooter name={getProfileName()} time={page.last_edited_time} />}
        />,
        document.body,
      )}
      {moving && createPortal(<MovePageModal pageId={id} onClose={() => setMoving(false)} />, document.body)}
      {open &&
        (childPages.length ? (
          childPages.map((c) => <TreeItem key={c} id={c} depth={depth + 1} />)
        ) : (
          <div className="tree-empty" style={{ paddingLeft: 30 + depth * 14 }}>
            No pages inside
          </div>
        ))}
    </>
  )
}
