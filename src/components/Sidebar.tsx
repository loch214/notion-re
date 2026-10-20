import { useEffect, useState } from 'react'
import { markdownToBlocks } from '../markdown'
import { HOME_ID, pageTitle, useStore } from '../store'
import { Icon, PlusIcon, TriangleIcon } from './Icons'
import { initials, useProfileName } from '../profile'
import { useUnreadCount } from './Inbox'

interface Props {
  onSearch: () => void
  onSettings: (tab?: 'account') => void
  onTrash: () => void
  onAI: () => void
  onInbox: () => void
  onTemplates: () => void
  onCollapse: () => void
}

const RECENT_KEY = 'notion-re:recent-pages'
const WIDTH_KEY = 'notion-re:sidebar-width'

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
    if (!current || current === HOME_ID) return
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

export function Sidebar({ onSearch, onSettings, onTrash, onAI, onInbox, onTemplates, onCollapse }: Props) {
  const unread = useUnreadCount()
  const rootPages = useStore((s) => s.rootPages)
  const blocks = useStore((s) => s.blocks)
  const createPage = useStore((s) => s.createPage)
  const current = useStore((s) => s.currentPageId)
  const name = useProfileName()
  const recents = useRecents(current)
    .filter((id) => blocks[id]?.alive && blocks[id].type === 'page')
    .slice(0, 5)
  const [width, setWidth] = useState(() => Math.min(480, Math.max(200, +(localStorage.getItem(WIDTH_KEY) ?? 240))))
  const [shut, setShut] = useState<Record<string, boolean>>({})
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const move = (m: MouseEvent) => setWidth(Math.min(480, Math.max(200, m.clientX)))
    const up = (m: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
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
    <aside className="sidebar" style={{ width }}>
      <div className="side-resizer" onMouseDown={startResize} />
      <div className="ws-header">
        <button className="ws-switcher" onClick={() => onSettings('account')} title="Your account">
          <span className="avatar">{initials(name)}</span>
          <span className="ws-name">{name ? `${name.split(' ')[0]}'s Notion` : 'Notion(RE)'}</span>
        </button>
        <span style={{ flex: 1 }} />
        <button className="ctl ws-ctl" title="Close sidebar (Ctrl+\\)" onClick={onCollapse}>
          <Icon name="collapse" size={18} />
        </button>
        <button className="ctl ws-ctl" title="New page (Ctrl+N)" onClick={() => createPage(null)}>
          <Icon name="compose" size={18} />
        </button>
      </div>
      <button className="side-search" onClick={onSearch}>
        <Icon name="search" size={16} />
        <span>Search</span>
        <kbd>Ctrl+K</kbd>
      </button>
      <nav className="side-actions">
        <button className={`side-item ${current === HOME_ID ? 'active' : ''}`} onClick={() => useStore.getState().openPage(HOME_ID)}>
          <span className="side-ic"><Icon name="home" /></span> Home
        </button>
        <button className="side-item" onClick={onAI}>
          <span className="side-ic"><Icon name="sparkle" /></span> AI chat
        </button>
        <button className="side-item" onClick={onInbox}>
          <span className="side-ic"><Icon name="inbox" /></span> Inbox
          {unread > 0 && <span className="side-badge">{unread}</span>}
        </button>
      </nav>

      <div className="side-scroll">
        {recents.length > 0 && (
          <>
            {section('recent', 'Recent')}
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
              ▦
            </button>
            <button className="ctl" title="New page" onClick={() => createPage(null)}>
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
        <button className="side-item" onClick={() => onSettings()}>
          <span className="side-ic"><Icon name="gear" /></span> Settings
        </button>
        <button className="side-item" onClick={onTemplates}>
          <span className="side-ic"><Icon name="template" /></span> Templates
        </button>
        <label className="side-item">
          <span className="side-ic"><Icon name="import" /></span> Import
          <input
            type="file"
            accept=".md,.markdown,.txt"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) importMarkdown(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        <button className="side-item" onClick={onTrash}>
          <span className="side-ic"><Icon name="trash" /></span> Trash
        </button>
      </div>
    </aside>
  )
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
        onClick={() => S().openPage(id)}
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
        <span className="tree-title">{pageTitle(page)}</span>
        <span className="tree-actions">
          <button
            className="ctl"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation()
              S().removeBlock(id)
            }}
          >
            <Icon name="trash" size={15} />
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
