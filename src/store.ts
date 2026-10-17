import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { makeBlock, type Workspace } from '../shared/blocks.ts'
import type { AISettings, Block, BlockType } from './types'

const DB_KEY = 'notion-re:workspace'
const SETTINGS_KEY = 'notion-re:ai-settings'

const now = () => Date.now()

/** Live updates: the server pings us whenever the workspace file changes. */
function listenForChanges() {
  const es = new EventSource('/api/events')
  let busy = false
  let again = false
  const refresh = async () => {
    if (busy) {
      again = true
      return
    }
    busy = true
    try {
      do {
        again = false
        const remote = await fetchServerWorkspace()
        if (remote) useStore.getState().mergeRemote(remote)
      } while (again)
    } finally {
      busy = false
    }
  }
  es.onmessage = refresh
}

/** Where the editor should put the caret next render. */
export interface FocusRequest {
  id: string
  at: 'start' | 'end' | number
}

interface State {
  loaded: boolean
  blocks: Record<string, Block>
  rootPages: string[]
  currentPageId: string | null
  focus: FocusRequest | null
  settings: AISettings

  load: () => Promise<void>
  mergeRemote: (remote: Workspace) => void
  openPage: (id: string | null) => void
  requestFocus: (f: FocusRequest | null) => void

  createPage: (parentId: string | null, title?: string) => string
  insertBlock: (opts: { after?: string; parent?: string; index?: number; type?: BlockType; title?: string }) => string
  updateBlock: (id: string, patch: Partial<Omit<Block, 'properties' | 'format'>> & { properties?: Partial<Block['properties']>; format?: Partial<Block['format']> }) => void
  setType: (id: string, type: BlockType) => void
  removeBlock: (id: string) => void
  restorePage: (id: string) => void
  purgePage: (id: string) => void
  indent: (id: string) => void
  outdent: (id: string) => void
  moveBlock: (id: string, targetId: string, position: 'before' | 'after') => void
  saveSettings: (s: AISettings) => void
}

const defaultSettings: AISettings = {
  provider: 'claude-code',
  apiKeys: {},
  models: {},
  baseUrl: '',
}

function welcomeWorkspace() {
  const blocks: Record<string, Block> = {}
  const page = makeBlock('page', null, 'Getting started')
  page.format.icon = '👋'
  blocks[page.id] = page
  const lines: [BlockType, string][] = [
    ['text', 'Welcome to <b>Notion(RE)</b> — a local-first, Notion-style workspace with bring-your-own AI.'],
    ['header', 'Basics'],
    ['bulleted_list', 'Type <code>/</code> for the block menu (headings, lists, to-dos, toggles, code…)'],
    ['bulleted_list', 'Markdown shortcuts work: <code>#</code>, <code>-</code>, <code>1.</code>, <code>[]</code>, <code>&gt;</code>, <code>```</code>, <code>---</code>'],
    ['bulleted_list', '<code>Tab</code> / <code>Shift+Tab</code> to indent, drag the ⋮⋮ handle to reorder'],
    ['to_do', 'Press <code>Space</code> on an empty line to ask AI'],
    ['header', 'AI'],
    ['callout', 'Open <b>Settings</b> in the sidebar and paste an API key for Anthropic, OpenAI, Gemini, or any OpenAI-compatible service. Keys stay in this browser.'],
  ]
  for (const [type, title] of lines) {
    const b = makeBlock(type, page.id, title)
    if (type === 'callout') b.format.icon = '💡'
    blocks[b.id] = b
    page.content.push(b.id)
  }
  return { blocks, rootPages: [page.id], currentPageId: page.id }
}

// ---- persistence ----
// "server" mode: the local dev server stores the workspace in data/workspace.json,
// which Claude can also edit through the MCP server. "local" mode (no server, e.g. a
// static build): everything lives in this browser's IndexedDB.
let mode: 'server' | 'local' = 'local'
/** Blocks as last confirmed by the server — used to send only what changed. */
let synced: Record<string, Block> = {}
let syncedRoots: string[] = []

function pushToServer(s: Pick<State, 'blocks' | 'rootPages'>, beacon = false) {
  const changed = Object.values(s.blocks).filter((b) => synced[b.id] !== b)
  const deleted = Object.keys(synced).filter((id) => !(id in s.blocks))
  if (!changed.length && !deleted.length && s.rootPages === syncedRoots) return
  const body = JSON.stringify({ blocks: changed, deleted, rootPages: s.rootPages })
  const prev = { synced, syncedRoots }
  synced = { ...s.blocks }
  syncedRoots = s.rootPages
  if (beacon) {
    navigator.sendBeacon('/api/sync', new Blob([body], { type: 'application/json' }))
    return
  }
  fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
    })
    .catch(() => {
      // Retry these changes on the next save.
      synced = prev.synced
      syncedRoots = prev.syncedRoots
    })
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let pending: State | null = null
function writeNow(beacon = false) {
  clearTimeout(saveTimer)
  if (!pending) return
  const s = pending
  pending = null
  localStorage.setItem('notion-re:current-page', s.currentPageId ?? '')
  if (mode === 'server') pushToServer(s, beacon)
  else idbSet(DB_KEY, { blocks: s.blocks, rootPages: s.rootPages, currentPageId: s.currentPageId })
}
function persist(s: State) {
  pending = s
  clearTimeout(saveTimer)
  saveTimer = setTimeout(writeNow, 300)
}
// Don't lose the last keystrokes when the tab is closed or reloaded.
window.addEventListener('pagehide', () => writeNow(true))
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && writeNow())

async function fetchServerWorkspace(): Promise<Workspace | null | undefined> {
  try {
    const r = await fetch('/api/workspace')
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return undefined
    return await r.json()
  } catch {
    return undefined
  }
}

export const useStore = create<State>((set, get) => {
  /** Apply an immutable update to the blocks map and persist. */
  const mutate = (fn: (blocks: Record<string, Block>, s: State) => Partial<State> | void) => {
    const s = get()
    const blocks = { ...s.blocks }
    const extra = fn(blocks, s) || {}
    set({ blocks, ...extra })
    persist(get())
  }
  const touch = (blocks: Record<string, Block>, id: string, patch: Partial<Block>) => {
    blocks[id] = { ...blocks[id], ...patch, last_edited_time: now() }
  }
  const detach = (blocks: Record<string, Block>, id: string) => {
    const pid = blocks[id].parent_id
    if (pid && blocks[pid]) touch(blocks, pid, { content: blocks[pid].content.filter((c) => c !== id) })
  }

  return {
    loaded: false,
    blocks: {},
    rootPages: [],
    currentPageId: null,
    focus: null,
    settings: defaultSettings,

    load: async () => {
      const [server, local, settings] = await Promise.all([fetchServerWorkspace(), idbGet(DB_KEY), idbGet(SETTINGS_KEY)])
      const savedPage = localStorage.getItem('notion-re:current-page')
      let ws: Workspace & { currentPageId?: string | null }
      let seed = false
      if (server !== undefined) {
        mode = 'server'
        if (server) {
          ws = server
          synced = { ...server.blocks }
          syncedRoots = server.rootPages
        } else {
          // First run with the server: move any pages from browser storage into the file.
          ws = local ?? welcomeWorkspace()
          seed = true
        }
      } else {
        ws = local ?? welcomeWorkspace()
        seed = !local
      }
      const pick = [savedPage, ws.currentPageId, ws.rootPages.find((id) => ws.blocks[id]?.alive)]
      const currentPageId = pick.find((id) => id && ws.blocks[id]) ?? null
      set({ blocks: ws.blocks, rootPages: ws.rootPages, currentPageId, settings: { ...defaultSettings, ...settings }, loaded: true })
      if (seed) persist(get())
      if (mode === 'server') listenForChanges()
    },

    mergeRemote: (remote) => {
      const s = get()
      const blocks = { ...s.blocks }
      let changed = false
      for (const [id, rb] of Object.entries(remote.blocks)) {
        const lb = blocks[id]
        if (!lb || rb.last_edited_time > lb.last_edited_time) {
          blocks[id] = rb
          synced[id] = rb
          changed = true
        } else if (lb.last_edited_time === rb.last_edited_time) synced[id] = lb
      }
      // Removed on the server, and not something new we haven't uploaded yet.
      for (const id of Object.keys(blocks)) {
        if (!(id in remote.blocks) && id in synced) {
          delete blocks[id]
          delete synced[id]
          changed = true
        }
      }
      const roots = [...remote.rootPages, ...s.rootPages.filter((id) => !remote.rootPages.includes(id))].filter((id) => blocks[id])
      const rootsChanged = roots.join() !== s.rootPages.join()
      if (!changed && !rootsChanged) return
      syncedRoots = roots
      const currentPageId = s.currentPageId && blocks[s.currentPageId] ? s.currentPageId : roots.find((id) => blocks[id].alive) ?? null
      set({ blocks, rootPages: rootsChanged ? roots : s.rootPages, currentPageId })
    },

    openPage: (id) => {
      set({ currentPageId: id })
      persist(get())
    },
    requestFocus: (focus) => set({ focus }),

    createPage: (parentId, title = '') => {
      const page = makeBlock('page', parentId, title)
      mutate((blocks, s) => {
        blocks[page.id] = page
        if (parentId) {
          touch(blocks, parentId, { content: [...blocks[parentId].content, page.id] })
          return { currentPageId: page.id }
        }
        return { rootPages: [...s.rootPages, page.id], currentPageId: page.id }
      })
      return page.id
    },

    insertBlock: ({ after, parent, index, type = 'text', title = '' }) => {
      const s = get()
      const parentId = after ? s.blocks[after].parent_id! : parent!
      const b = makeBlock(type, parentId, title)
      if (type === 'callout') b.format.icon = '💡'
      mutate((blocks) => {
        blocks[b.id] = b
        const content = [...blocks[parentId].content]
        const at = after ? content.indexOf(after) + 1 : index ?? content.length
        content.splice(at, 0, b.id)
        touch(blocks, parentId, { content })
      })
      return b.id
    },

    updateBlock: (id, patch) =>
      mutate((blocks) => {
        const b = blocks[id]
        if (!b) return
        touch(blocks, id, {
          ...patch,
          properties: { ...b.properties, ...patch.properties },
          format: { ...b.format, ...patch.format },
        })
      }),

    setType: (id, type) =>
      mutate((blocks) => {
        const b = blocks[id]
        const properties = { ...b.properties }
        if (type === 'to_do' && properties.checked === undefined) properties.checked = false
        const format = { ...b.format }
        if (type === 'callout' && !format.icon) format.icon = '💡'
        touch(blocks, id, { type, properties, format })
      }),

    // Soft delete, like Notion: pages go to trash, other blocks just disappear.
    removeBlock: (id) =>
      mutate((blocks, s) => {
        const b = blocks[id]
        touch(blocks, id, { alive: false })
        if (b.type === 'page') {
          return {
            currentPageId: s.currentPageId === id ? b.parent_id ?? s.rootPages.find((p) => p !== id) ?? null : s.currentPageId,
          }
        }
        detach(blocks, id)
      }),

    restorePage: (id) =>
      mutate((blocks, s) => {
        touch(blocks, id, { alive: true })
        const pid = blocks[id].parent_id
        // If the parent page is gone too, restore it as a top-level page.
        if (pid && (!blocks[pid] || !blocks[pid].alive)) {
          if (blocks[pid]) detach(blocks, id)
          touch(blocks, id, { parent_id: null })
          return { rootPages: [...s.rootPages, id] }
        }
      }),

    purgePage: (id) =>
      mutate((blocks, s) => {
        const drop = (bid: string) => {
          blocks[bid]?.content.forEach(drop)
          delete blocks[bid]
        }
        detach(blocks, id)
        drop(id)
        return { rootPages: s.rootPages.filter((p) => p !== id) }
      }),

    indent: (id) =>
      mutate((blocks) => {
        const b = blocks[id]
        const parent = blocks[b.parent_id!]
        const i = parent.content.indexOf(id)
        if (i <= 0) return
        const prevId = parent.content[i - 1]
        const prev = blocks[prevId]
        if (prev.type === 'page' || prev.type === 'divider' || prev.type === 'code') return
        touch(blocks, parent.id, { content: parent.content.filter((c) => c !== id) })
        touch(blocks, prevId, { content: [...prev.content, id], format: { ...prev.format, collapsed: false } })
        touch(blocks, id, { parent_id: prevId })
      }),

    outdent: (id) =>
      mutate((blocks) => {
        const b = blocks[id]
        const parent = blocks[b.parent_id!]
        if (parent.type === 'page' || !parent.parent_id) return
        const grand = blocks[parent.parent_id]
        // Following siblings become children of the outdented block (Notion behaviour).
        const i = parent.content.indexOf(id)
        const following = parent.content.slice(i + 1)
        touch(blocks, parent.id, { content: parent.content.slice(0, i) })
        following.forEach((c) => touch(blocks, c, { parent_id: id }))
        touch(blocks, id, { parent_id: grand.id, content: [...b.content, ...following] })
        const gc = [...grand.content]
        gc.splice(gc.indexOf(parent.id) + 1, 0, id)
        touch(blocks, grand.id, { content: gc })
      }),

    moveBlock: (id, targetId, position) =>
      mutate((blocks) => {
        if (id === targetId) return
        // Don't allow dropping a block inside its own subtree.
        for (let p = blocks[targetId].parent_id; p; p = blocks[p]?.parent_id ?? null) if (p === id) return
        detach(blocks, id)
        const newParent = blocks[targetId].parent_id!
        const content = [...blocks[newParent].content]
        content.splice(content.indexOf(targetId) + (position === 'after' ? 1 : 0), 0, id)
        touch(blocks, newParent, { content })
        touch(blocks, id, { parent_id: newParent })
      }),

    saveSettings: (settings) => {
      set({ settings })
      idbSet(SETTINGS_KEY, settings)
    },
  }
})

/** Blocks of a page in reading order, skipping collapsed toggle children. */
export function visibleOrder(blocks: Record<string, Block>, pageId: string): string[] {
  const out: string[] = []
  const walk = (id: string) => {
    for (const c of blocks[id]?.content ?? []) {
      const b = blocks[c]
      if (!b || !b.alive) continue
      out.push(c)
      if (b.type !== 'page' && !(b.type === 'toggle' && b.format.collapsed)) walk(c)
    }
  }
  walk(pageId)
  return out
}

export function pageTitle(b?: Block) {
  return b?.properties.title || 'Untitled'
}

/** Breadcrumb path from the top-level page down to `id`. */
export function pagePath(blocks: Record<string, Block>, id: string): Block[] {
  const path: Block[] = []
  for (let cur: Block | undefined = blocks[id]; cur; cur = cur.parent_id ? blocks[cur.parent_id] : undefined) {
    if (cur.type === 'page') path.unshift(cur)
  }
  return path
}
