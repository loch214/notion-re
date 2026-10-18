// Page links: the open page lives in the URL as #/<pageId>, so links can be copied and the
// browser's Back / Forward (and Notion's Ctrl+[ / Ctrl+]) walk through the pages you visited.

import { useStore } from './store'

export const pageUrl = (id: string) => `${location.origin}${location.pathname}#/${id}`

const hashPage = () => location.hash.match(/^#\/([\w-]+)/)?.[1] ?? null

export function startRouter() {
  // Opening a page (from anywhere) adds a history entry.
  useStore.subscribe((s, prev) => {
    const id = s.currentPageId
    if (!id || id === prev.currentPageId || id === hashPage()) return
    // The first page after loading replaces the bare URL instead of adding a step.
    if (!hashPage()) history.replaceState(null, '', `#/${id}`)
    else history.pushState(null, '', `#/${id}`)
  })
  // Back / Forward, or a pasted link: open that page if it exists.
  window.addEventListener('popstate', () => {
    const id = hashPage()
    const S = useStore.getState()
    if (id && S.blocks[id] && id !== S.currentPageId) S.openPage(id)
  })
}
