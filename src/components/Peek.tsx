// Side peek: database rows open in a panel on the right (Notion's default "Open pages in → Side peek").
// "Open as full page" or a view set to "Full page" opens them normally instead.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { pageTitle, useStore } from '../store'
import type { DbView } from '../types'
import { Icon } from './Icons'
import { PageView } from './PageView'
import { copyPageLink, PageMenu, toggleFavorite } from './PageMenu'

let peekId: string | null = null
const listeners = new Set<() => void>()
const setPeek = (id: string | null) => {
  peekId = id
  listeners.forEach((l) => l())
}
const usePeek = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => peekId,
  )

// The rows in the order the view showed them, for the peek's ↑ / ↓ (Ctrl+Shift+K / J).
let peekOrder: string[] = []

/** Open a database row the way its view says (side peek unless the view is set to full page). */
export function openRow(id: string, view?: DbView, order?: string[]) {
  if (view?.open_in === 'full_page') return useStore.getState().openPage(id)
  peekOrder = order ?? []
  setPeek(id)
}

/** The row before / after the peeked one: the view's order, else the database's row order. */
function sibling(id: string, step: number) {
  const { blocks } = useStore.getState()
  const parent = blocks[blocks[id]?.parent_id ?? '']
  const ids = peekOrder.includes(id) ? peekOrder : (parent?.content ?? []).filter((c) => blocks[c]?.alive && blocks[c].type === 'page' && !blocks[c].format.template)
  return ids[ids.indexOf(id) + step]
}

/** The row open in the peek (rows outline themselves blue, like Notion). */
export const usePeekId = usePeek

export function PeekPanel() {
  const id = usePeek()
  // Notion's peek pushes the page aside and slides in / out (0.2s); keep the last page while sliding out.
  const [shownId, setShownId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (id) {
      setShownId(id)
      let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => setOpen(true))))
      return () => cancelAnimationFrame(raf)
    }
    setOpen(false)
    const t = setTimeout(() => setShownId(null), 220)
    return () => clearTimeout(t)
  }, [id])
  // Clicking the page outside a database closes the peek (clicks on rows switch it instead).
  useEffect(() => {
    if (!id) return
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('.peek, .popover, .modal-backdrop, [class*="db-"], .ai-dock, .sidebar')) return
      if (t.closest('.main')) setPeek(null)
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [id])
  const page = useStore((s) => (id ? s.blocks[id] : undefined))
  const current = useStore((s) => s.currentPageId)
  // Going to another page (link, sidebar, back) closes the peek, like Notion.
  useEffect(() => setPeek(null), [current])
  useEffect(() => {
    if (id && (!page || !page.alive)) setPeek(null)
  }, [id, page])
  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLElement && e.target.closest('[contenteditable="true"], input, textarea'))) setPeek(null)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'K' || e.key === 'j' || e.key === 'k')) {
        const next = sibling(id, e.key.toLowerCase() === 'j' ? 1 : -1)
        if (next) {
          e.preventDefault()
          setPeek(next)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])
  const shown = useStore((s) => (shownId ? s.blocks[shownId] : undefined))
  if (!shownId || !shown) return null
  const pid = shownId
  return (
    <div className={`peek-dock ${open && id ? 'open' : ''}`}>
      <aside className="peek" aria-label={`Peek: ${pageTitle(shown)}`}>
        <header className="peek-head">
          <button className="ctl" title="Close (Esc)" onClick={() => setPeek(null)}><Icon name="expand" size={16} /></button>
          <button className="ctl" title="Open as full page" onClick={() => useStore.getState().openPage(pid)}><Icon name="openFull" size={16} /></button>
          <span className="peek-sep" />
          <button className="ctl" title="Previous (Ctrl+Shift+K)" disabled={!sibling(pid, -1)} onClick={() => setPeek(sibling(pid, -1) ?? pid)}><Icon name="up" size={16} /></button>
          <button className="ctl" title="Next (Ctrl+Shift+J)" disabled={!sibling(pid, 1)} onClick={() => setPeek(sibling(pid, 1) ?? pid)}><Icon name="down" size={16} /></button>
          <span style={{ flex: 1 }} />
          <button className="ctl peek-btn" title="Copy link" onClick={() => copyPageLink(pid)}><Icon name="link" size={16} /></button>
          <button className={`ctl peek-btn fav-star ${shown.format.favorite ? 'on' : ''}`} title={shown.format.favorite ? 'Remove from Favorites' : 'Add to Favorites'} onClick={() => toggleFavorite(pid)}><Icon name="star" size={16} /></button>
          <button className="ctl peek-btn" title="Style, export, and more" onClick={() => setMenuOpen(!menuOpen)}><Icon name="more" size={16} /></button>
        </header>
        <div className="peek-scroll">
          <PageView key={pid} pageId={pid} />
        </div>
      </aside>
      {menuOpen && <PageMenu pageId={pid} onClose={() => setMenuOpen(false)} onHistory={() => useStore.getState().openPage(pid)} onMove={() => useStore.getState().openPage(pid)} />}
      {id && <style>{`[data-row-id="${id}"] { box-shadow: inset 0 0 0 2px var(--accent); border-radius: 4px; }`}</style>}
    </div>
  )
}
