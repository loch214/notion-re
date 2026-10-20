// Page links: the open page lives in the URL as #/<pageId>, so links can be copied and the
// browser's Back / Forward (and Notion's Ctrl+[ / Ctrl+]) walk through the pages you visited.

import { isScreen, useStore } from './store'

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
    if (id && (S.blocks[id] || isScreen(id)) && id !== S.currentPageId) S.openPage(id)
  })
}

/** "Copy link to block": the page link plus the block id; opening it scrolls to the block. */
export const blockUrl = (pageId: string, blockId: string) => `${pageUrl(pageId)}/${blockId}`

const hashBlock = () => location.hash.match(/^#\/[\w-]+\/([\w-]+)/)?.[1] ?? null

/** Scroll to the block named in the link and flash it, like Notion does. */
export function revealLinkedBlock() {
  const id = hashBlock()
  if (!id) return
  let tries = 0
  const find = () => {
    const el = document.querySelector(`[data-block-id="${id}"]`)
    if (!el) return void (++tries < 20 && setTimeout(find, 100))
    el.scrollIntoView({ block: 'center' })
    el.classList.add('block-flash')
    setTimeout(() => el.classList.remove('block-flash'), 2000)
  }
  find()
}
