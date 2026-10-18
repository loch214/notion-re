import { useState } from 'react'
import { pageTitle, useStore } from '../store'
import { TriangleIcon } from './Icons'

interface Props {
  onSearch: () => void
  onSettings: () => void
  onTrash: () => void
  onAI: () => void
}

export function Sidebar({ onSearch, onSettings, onTrash, onAI }: Props) {
  const rootPages = useStore((s) => s.rootPages)
  const blocks = useStore((s) => s.blocks)
  const createPage = useStore((s) => s.createPage)
  // Favorites: every live page with the star, by title (when it was starred is not stored).
  const favorites = Object.values(blocks)
    .filter((b) => b.type === 'page' && b.alive && b.format.favorite)
    .sort((a, b) => pageTitle(a).localeCompare(pageTitle(b)))
    .map((b) => b.id)

  return (
    <aside className="sidebar">
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

function TreeItem({ id, depth }: { id: string; depth: number }) {
  const page = useStore((s) => s.blocks[id])
  const blocks = useStore((s) => s.blocks)
  const current = useStore((s) => s.currentPageId)
  const [open, setOpen] = useState(false)
  const S = useStore.getState

  // A database's child pages are its rows; like Notion, they don't appear in the tree.
  const childPages = page.schema ? [] : page.content.filter((c) => blocks[c]?.alive && blocks[c].type === 'page')

  return (
    <>
      <div
        className={`tree-item ${current === id ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
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
