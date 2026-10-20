// Side peek: database rows open in a panel on the right (Notion's default "Open pages in → Side peek").
// "Open as full page" or a view set to "Full page" opens them normally instead.

import { useEffect, useSyncExternalStore } from 'react'
import { pageTitle, useStore } from '../store'
import type { DbView } from '../types'
import { Icon } from './Icons'
import { PageView } from './PageView'
import { copyPageLink } from './PageMenu'

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

export function PeekPanel() {
  const id = usePeek()
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
  if (!id || !page) return null
  return (
    <>
      <div className="peek-backdrop" onMouseDown={() => setPeek(null)} />
      <aside className="peek" aria-label={`Peek: ${pageTitle(page)}`}>
        <header className="peek-head">
          <button className="ctl" title="Close (Esc)" onClick={() => setPeek(null)}><Icon name="expand" size={16} /></button>
          <button className="ctl" title="Open as full page" onClick={() => useStore.getState().openPage(id)}><Icon name="openFull" size={16} /></button>
          <span className="peek-sep" />
          <button className="ctl" title="Previous (Ctrl+Shift+K)" disabled={!sibling(id, -1)} onClick={() => setPeek(sibling(id, -1) ?? id)}><Icon name="up" size={16} /></button>
          <button className="ctl" title="Next (Ctrl+Shift+J)" disabled={!sibling(id, 1)} onClick={() => setPeek(sibling(id, 1) ?? id)}><Icon name="down" size={16} /></button>
          <span style={{ flex: 1 }} />
          <button className="ctl" title="Copy link" onClick={() => copyPageLink(id)}><Icon name="link" size={16} /></button>
        </header>
        <div className="peek-scroll">
          <PageView key={id} pageId={id} />
        </div>
      </aside>
    </>
  )
}
