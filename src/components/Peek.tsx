// Side peek: database rows open in a panel on the right (Notion's default "Open pages in → Side peek").
// "Open as full page" or a view set to "Full page" opens them normally instead.

import { useEffect, useSyncExternalStore } from 'react'
import { pageTitle, useStore } from '../store'
import type { DbView } from '../types'
import { Icon } from './Icons'
import { PageView } from './PageView'

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

/** Open a database row the way its view says (side peek unless the view is set to full page). */
export function openRow(id: string, view?: DbView) {
  if (view?.open_in === 'full_page') useStore.getState().openPage(id)
  else setPeek(id)
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
          <button className="ctl" title="Open as full page" onClick={() => useStore.getState().openPage(id)}><Icon name="peek" size={16} /></button>
          <span style={{ flex: 1 }} />
        </header>
        <div className="peek-scroll">
          <PageView key={id} pageId={id} />
        </div>
      </aside>
    </>
  )
}
