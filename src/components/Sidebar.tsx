import { useEffect, useState } from 'react'
import { pageTitle, useStore } from '../store'
import { TriangleIcon } from './Icons'

interface Props {
  onSearch: () => void
  onSettings: () => void
  onTrash: () => void
  onAI: () => void
}

const RECENT_KEY = 'notion-re:recent-pages'
const WIDTH_KEY = 'notion-re:sidebar-width'

function useRecents(current: string | null) {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  useEffect(() => {
    if (!current) return
    setIds((old) => {
      const next = [current, ...old.filter((i) => i !== current)].slice(0, 12)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      return next
    })
  }, [current])
  return ids
}

export function Sidebar({ onSearch, onSettings, onTrash, onAI }: Props) {
  const rootPages = useStore((s) => s.rootPages)
  const blocks = useStore((s) => s.blocks)
  const createPage = useStore((s) => s.createPage)
  const current = useStore((s) => s.currentPageId)
  const recents = useRecents(current)
    .filter((id) => blocks[id]?.alive && blocks[id].type === 'page')
    .slice(0, 5)
  const [width, setWidth] = useState(() => Math.min(480, Math.max(200, +(localStorage.getItem(WIDTH_KEY) ?? 240))))
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

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="side-resizer" onMouseDown={startResize} />
      <div className="ws-header">
        <span className="ws-logo">N</span>
        <span className="ws-name">Notion(RE)</span>
      </div>
      <nav className="side-actions">
        <button className="side-item" onClick={onSearch}>
          <span className="side-ic">🔍</span> Search <kbd>Ctrl K</kbd>
        </button>
        <button className="side-item" onClick={onAI}>
          <span className="side-ic">✨</span> AI assistant
        </button>
        <button className="side-item" onClick={onSettings}>
          <span className="side-ic">⚙️</span> Settings
        </button>
      </nav>

      {recents.length > 0 && (
        <>
          <div className="side-section">
            <span>Recent</span>
          </div>
          <div className="tree tree-favorites">
            {recents.map((id) => (
              <RecentItem key={id} id={id} />
            ))}
          </div>
        </>
      )}

      {favorites.length > 0 && (
        <>
          <div className="side-section">
            <span>Favorites</span>
          </div>
          <div className="tree tree-favorites">
            {favorites.map((id) => (
              <TreeItem key={id} id={id} depth={0} />
            ))}
          </div>
        </>
      )}

      <div className="side-section">
        <span>Private</span>
        <button className="ctl" title="New page" onClick={() => createPage(null)}>+</button>
      </div>
      <div className="tree">
        {rootPages
          .filter((id) => blocks[id]?.alive)
          .map((id) => (
            <TreeItem key={id} id={id} depth={0} />
          ))}
        <button className="side-item muted" onClick={() => createPage(null)}>
          <span className="side-ic">＋</span> New page
        </button>
        <button className="side-item muted" onClick={() => useStore.getState().createDatabase({ parent: null })}>
          <span className="side-ic">▦</span> New database
        </button>
      </div>

      <div className="side-bottom">
        <button className="side-item" onClick={onTrash}>
          <span className="side-ic">🗑</span> Trash
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
        <span className="tree-icon">{page.format.icon ?? '📄'}</span>
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
          <span className="tree-icon">{page.format.icon ?? '📄'}</span>
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
            🗑
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
            +
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
