import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { defaultSchema, duplicateTree, htmlToPlain as htmlToPlainText, makeBlock, normalizeRoots, type Workspace } from '../shared/blocks.ts'
import { addDbTemplate, buildTemplate, findTemplate, rowFromTemplate } from '../shared/templates.ts'
import type { AISettings, Block, BlockType, CellValue } from './types'

const DB_KEY = 'notion-re:workspace'
const SETTINGS_KEY = 'notion-re:ai-settings'
/** Copy of the server's workspace, so a slow server doesn't mean a blank screen on start. */
const CACHE_KEY = 'notion-re:server-cache'
/** Settings → Open on start: a page id, or empty for the last visited page. */
export const START_PAGE_KEY = 'notion-re:start-page'
/** Pseudo page id for Home (not a block; the URL is #/home). */
export const HOME_ID = 'home'
/** Notion's Library (all pages in a table); like Home it's a screen, not a block. */
export const LIBRARY_ID = 'library'
export const isScreen = (id: string | null | undefined) => id === HOME_ID || id === LIBRARY_ID

const now = () => Date.now()
const HEADING_TYPES: BlockType[] = ['header', 'sub_header', 'sub_sub_header', 'header_4']

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
  /** Restore from a backup: blocks missing here or older here are put back (one undo step); returns how many. */
  mergeBlocks: (incoming: Block[]) => number
  openPage: (id: string | null) => void
  requestFocus: (f: FocusRequest | null) => void
  /** Blocks picked with Esc / Shift+click / drag-select (see BlockSelection.tsx). */
  selection: string[]
  setSelection: (ids: string[]) => void

  createPage: (parentId: string | null, title?: string) => string
  /** New full-page database, at the top level or inside `parent` (after block `after`). Opens it. */
  createDatabase: (opts: { parent: string | null; after?: string; inline?: boolean }) => string
  addRow: (dbId: string, title?: string, cells?: Record<string, CellValue>) => string
  /** New row from a template (`undefined` = the database's default template, `null` = empty page). */
  newDbRow: (dbId: string, templateId?: string | null, cells?: Record<string, CellValue>) => string
  /** Add an empty database template and return its id. */
  addDbTemplate: (dbId: string) => string
  /** Make a page (or database) from the Templates gallery and open it. */
  addFromTemplate: (key: string, parentId: string | null) => string
  setCell: (rowId: string, propId: string, value: CellValue) => void
  /** Copy a block or page (with everything inside it) right after the original. */
  duplicate: (id: string) => string
  insertBlock: (opts: { after?: string; parent?: string; index?: number; type?: BlockType; title?: string }) => string
  /** Insert a block with children (columns, tables…) after `after` or inside `parent`. Returns its id. */
  insertTree: (at: { after?: string; parent?: string }, tree: BlockTree) => string
  updateBlock: (id: string, patch: Partial<Omit<Block, 'properties' | 'format'>> & { properties?: Partial<Block['properties']>; format?: Partial<Block['format']> }) => void
  setType: (id: string, type: BlockType) => void
  /** Ctrl+Alt+T: close every toggle on the page, or open them all if they're all closed. */
  toggleAll: (pageId: string) => void
  /** Turn a block into a sub-page with the block's text as its title (Ctrl+Shift+9). */
  turnIntoPage: (id: string) => void
  removeBlock: (id: string) => void
  restorePage: (id: string) => void
  purgePage: (id: string) => void
  indent: (id: string) => void
  outdent: (id: string) => void
  moveBlock: (id: string, targetId: string, position: 'before' | 'after') => void
  /** "Move to": put a page at the end of another page, or at the top level (`null`). */
  movePage: (id: string, parentId: string | null) => void
  /** Drag-and-drop in the sidebar: put page `id` before / after / inside page `targetId`. */
  placePage: (id: string, targetId: string, where: 'before' | 'after' | 'inside') => void
  saveSettings: (s: AISettings) => void

  /** Bumped whenever the undo/redo stacks change, so UI can re-render. */
  historyTick: number
  /** Latest screen-reader message ("Undone", "Nothing to undo", …). */
  announcement: string
  toast: Toast | null
  undo: () => void
  redo: () => void
  /** Run several actions as one undo step (e.g. splitting a block with Enter). */
  transact: (fn: () => void) => void
  /** Record remote changes (e.g. an AI turn) under one named undo step until `endCheckpoint`. */
  beginCheckpoint: (name: string) => void
  endCheckpoint: (name: string) => void
  /** Undo a named step wherever it is in the stack. */
  undoNamed: (name: string) => { restored: number; skipped: number } | null
  showToast: (t: Toast | null) => void
}

export interface BlockTree {
  type: BlockType
  title?: string
  properties?: Partial<Block['properties']>
  format?: Partial<Block['format']>
  children?: BlockTree[]
}

export interface Toast {
  label: string
  action?: { label: string; run: () => void }
}

// ---- undo / redo ----
// Modelled on Notion's revision stack (analysis/undo-and-history.md): every edit is recorded
// with the before/after version of each block it touched; edits of the same kind within
// 700 ms of the step's start merge into one step; named checkpoints group a whole AI turn.

interface Change {
  before?: Block
  after?: Block
}

interface Revision {
  changes: Record<string, Change>
  rootsBefore: string[]
  rootsAfter: string[]
  kind: 'text' | 'structure'
  timestamp: number
  name?: string
  undoRedoCount: number
  /** Block that had the caret when the step started; focused again on undo. */
  focusId?: string
}

const MERGE_MS = 700
const MAX_STEPS = 200
const undoStack: Revision[] = []
const redoStack: Revision[] = []
let checkpoint: string | null = null
let batch: Revision | null = null
let batchDepth = 0

/** Every block that differs between two versions of the blocks map. */
function diffBlocks(prev: Record<string, Block>, next: Record<string, Block>): Record<string, Change> {
  const changes: Record<string, Change> = {}
  for (const id in next) if (prev[id] !== next[id]) changes[id] = { before: prev[id], after: next[id] }
  for (const id in prev) if (!(id in next)) changes[id] = { before: prev[id], after: undefined }
  return changes
}

/** "text" = only block text changed (typing); everything else is structural. */
function kindOf(changes: Record<string, Change>): Revision['kind'] {
  const textOnly = Object.values(changes).every(
    ({ before: b, after: a }) =>
      b && a && b.type === a.type && b.alive === a.alive && b.parent_id === a.parent_id && b.content === a.content &&
      b.properties.checked === a.properties.checked && JSON.stringify(b.format) === JSON.stringify(a.format),
  )
  return textOnly ? 'text' : 'structure'
}

function focusedBlockId() {
  return (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
}

/** True if `cur` is still the version a revision left behind (nobody edited it since). */
const sameVersion = (cur?: Block, expected?: Block) =>
  cur === expected || (!!cur && !!expected && cur.last_edited_time === expected.last_edited_time)

function recordHistory(changes: Record<string, Change>, rootsBefore: string[], rootsAfter: string[], name?: string) {
  if (!Object.keys(changes).length && rootsBefore === rootsAfter) return false
  const kind = name ? 'structure' : kindOf(changes)
  const now = Date.now()
  const last = undoStack.at(-1)
  let rev: Revision | undefined
  if (name) rev = undoStack.find((r) => r.name === name)
  else if (batch) rev = batch
  else if (last && !last.name && now - last.timestamp <= MERGE_MS && last.undoRedoCount === 0 && last.kind === kind) rev = last
  if (!rev) {
    rev = { changes: {}, rootsBefore, rootsAfter, kind, timestamp: now, name, undoRedoCount: 0, focusId: focusedBlockId() }
    undoStack.push(rev)
    if (undoStack.length > MAX_STEPS) undoStack.shift()
  }
  if (batchDepth > 0 && !name) batch = rev
  for (const [id, c] of Object.entries(changes)) {
    const prev = rev.changes[id]
    rev.changes[id] = { before: prev ? prev.before : c.before, after: c.after }
  }
  rev.rootsAfter = rootsAfter
  redoStack.length = 0
  return true
}

const defaultSettings: AISettings = {
  provider: 'claude-code',
  apiKeys: {},
  models: {},
  baseUrl: '',
  fileAccess: 'ask',
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

/** The latest upload to the server, so callers can wait for it (see `flushSaves`). */
let inFlight: Promise<void> = Promise.resolve()

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
  inFlight = fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
    })
    .catch(() => {
      // Retry these changes on the next save.
      synced = prev.synced
      syncedRoots = prev.syncedRoots
    })
}

let lastCache = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
let pending: State | null = null
function writeNow(beacon = false) {
  clearTimeout(saveTimer)
  if (!pending) return
  const s = pending
  pending = null
  localStorage.setItem('notion-re:current-page', s.currentPageId ?? '')
  if (mode === 'server') {
    pushToServer(s, beacon)
    if (!beacon && Date.now() - lastCache > 3000) {
      lastCache = Date.now()
      idbSet(CACHE_KEY, { blocks: s.blocks, rootPages: s.rootPages, currentPageId: s.currentPageId })
    }
  }
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
    const recorded = recordHistory(diffBlocks(s.blocks, blocks), s.rootPages, extra.rootPages ?? s.rootPages)
    set({ blocks, ...extra, ...(recorded ? { historyTick: s.historyTick + 1 } : {}) })
    persist(get())
  }

  /** Put back the "before" side of a revision. Returns the opposite revision (for redo / undo). */
  const revert = (rev: Revision): { inverse: Revision; restored: number; skipped: number } => {
    const s = get()
    const blocks = { ...s.blocks }
    const t = now()
    const applied: Record<string, Change> = {}
    let skipped = 0
    for (const [id, c] of Object.entries(rev.changes)) {
      const cur = blocks[id]
      // Changed by someone else since (you after an AI turn, or another tab): keep their version.
      if (!sameVersion(cur, c.after)) {
        skipped++
        continue
      }
      if (c.before) blocks[id] = { ...c.before, last_edited_time: t }
      else delete blocks[id]
      applied[id] = { before: cur, after: blocks[id] }
    }
    // A removed block must not stay listed in a parent we couldn't restore.
    for (const [id, c] of Object.entries(applied)) {
      const pid = c.before?.parent_id
      if (!c.after && pid && blocks[pid]?.content.includes(id)) {
        blocks[pid] = { ...blocks[pid], content: blocks[pid].content.filter((x) => x !== id), last_edited_time: t }
      }
    }
    // Top-level pages: take back what the step added, put back what it removed.
    const added = rev.rootsAfter.filter((id) => !rev.rootsBefore.includes(id))
    const roots = s.rootPages.filter((id) => !added.includes(id))
    rev.rootsBefore.forEach((id, i) => {
      if (!roots.includes(id) && !rev.rootsAfter.includes(id)) roots.splice(Math.min(i, roots.length), 0, id)
    })
    const rootPages = roots.filter((id) => blocks[id])
    const cur = s.currentPageId
    const currentPageId = isScreen(cur) || (cur && blocks[cur]) ? cur : (cur && s.blocks[cur]?.parent_id) || rootPages.find((id) => blocks[id]?.alive) || null
    set({ blocks, rootPages, currentPageId, historyTick: s.historyTick + 1 })
    persist(get())
    if (rev.focusId && blocks[rev.focusId]?.alive && blocks[rev.focusId].type !== 'page') get().requestFocus({ id: rev.focusId, at: 'end' })
    const inverse: Revision = {
      changes: applied,
      rootsBefore: s.rootPages,
      rootsAfter: rootPages,
      kind: rev.kind,
      timestamp: t,
      name: rev.name,
      undoRedoCount: rev.undoRedoCount + 1,
      focusId: rev.focusId,
    }
    return { inverse, restored: Object.keys(applied).length, skipped }
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
    selection: [],
    setSelection: (selection) => set({ selection }),
    settings: defaultSettings,

    load: async () => {
      const serverP = fetchServerWorkspace()
      // Server slow to answer: show the last copy we saw right away, then switch to the real data.
      const fast = await Promise.race([serverP.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 150))])
      if (!fast) {
        const cached = (await idbGet(CACHE_KEY)) as (Workspace & { currentPageId?: string | null }) | undefined
        if (cached && !get().loaded) {
          const id = cached.currentPageId && cached.blocks[cached.currentPageId] ? cached.currentPageId : null
          set({ blocks: cached.blocks, rootPages: normalizeRoots(cached.blocks, cached.rootPages), currentPageId: id, loaded: true })
        }
      }
      const [server, local, settings] = await Promise.all([serverP, idbGet(DB_KEY), idbGet(SETTINGS_KEY)])
      const savedPage = localStorage.getItem('notion-re:current-page')
      // A link like #/<pageId> wins over the last page you had open.
      const linked = location.hash.match(/^#\/([\w-]+)/)?.[1]
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
      const pick = [linked, localStorage.getItem(START_PAGE_KEY), savedPage, ws.currentPageId, ws.rootPages.find((id) => ws.blocks[id]?.alive)]
      const currentPageId = pick.find((id) => id && (ws.blocks[id] || isScreen(id))) ?? null
      // Repairs a list that an older version let drift (duplicates, pages moved inside others).
      const rootPages = normalizeRoots(ws.blocks, ws.rootPages)
      if (rootPages.join() !== ws.rootPages.join()) seed = true
      set({ blocks: ws.blocks, rootPages, currentPageId, settings: { ...defaultSettings, ...settings }, loaded: true })
      if (seed) persist(get())
      if (mode === 'server') {
        lastCache = Date.now()
        idbSet(CACHE_KEY, { blocks: ws.blocks, rootPages, currentPageId })
        listenForChanges()
      }
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
      const roots = normalizeRoots(blocks, [...remote.rootPages, ...s.rootPages.filter((id) => !remote.rootPages.includes(id))])
      const rootsChanged = roots.join() !== s.rootPages.join()
      if (!changed && !rootsChanged) return
      syncedRoots = roots
      const currentPageId = isScreen(s.currentPageId) || (s.currentPageId && blocks[s.currentPageId]) ? s.currentPageId : roots.find((id) => blocks[id].alive) ?? null
      // Changes from elsewhere aren't yours to undo — except during a checkpoint (an AI turn).
      const recorded = checkpoint
        ? recordHistory(diffBlocks(s.blocks, blocks), s.rootPages, rootsChanged ? roots : s.rootPages, checkpoint)
        : false
      set({ blocks, rootPages: rootsChanged ? roots : s.rootPages, currentPageId, ...(recorded ? { historyTick: s.historyTick + 1 } : {}) })
    },

    mergeBlocks: (incoming) => {
      let n = 0
      mutate((blocks, s) => {
        for (const b of incoming) {
          if (!b?.id || typeof b.type !== 'string') continue
          const here = blocks[b.id]
          if (here && here.last_edited_time >= b.last_edited_time) continue
          blocks[b.id] = { ...b, last_edited_time: Date.now() }
          n++
        }
        const roots = incoming.filter((b) => b?.parent_id === null && b.type === 'page').map((b) => b.id)
        return { rootPages: normalizeRoots(blocks, [...s.rootPages, ...roots.filter((id) => !s.rootPages.includes(id))]) }
      })
      return n
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

    createDatabase: ({ parent, after, inline }) => {
      const db = makeBlock('page', parent, '')
      if (inline && parent) db.format.inline = true
      db.format.icon = '🗂️'
      db.schema = defaultSchema()
      mutate((blocks, s) => {
        blocks[db.id] = db
        // Start with a few empty rows, like Notion.
        for (let i = 0; i < 3; i++) {
          const row = makeBlock('page', db.id)
          blocks[row.id] = row
          db.content.push(row.id)
        }
        if (!parent) return { rootPages: [...s.rootPages, db.id], currentPageId: db.id }
        const content = [...blocks[parent].content]
        const at = after ? content.indexOf(after) + 1 : content.length
        content.splice(at, 0, db.id)
        touch(blocks, parent, { content })
        return inline ? {} : { currentPageId: db.id }
      })
      return db.id
    },

    newDbRow: (dbId, templateId, cells) => {
      let id = ''
      mutate((blocks) => {
        const t = templateId === undefined ? blocks[dbId].format.default_template ?? null : templateId
        id = rowFromTemplate(blocks, dbId, t && blocks[t]?.alive ? t : null, cells)
      })
      return id
    },

    addDbTemplate: (dbId) => {
      let id = ''
      mutate((blocks) => {
        id = addDbTemplate(blocks, dbId)
      })
      return id
    },

    addFromTemplate: (key, parentId) => {
      const tpl = findTemplate(key)
      if (!tpl) return ''
      let id = ''
      mutate((blocks, s) => {
        id = buildTemplate(blocks, tpl, parentId)
        return parentId ? { currentPageId: id } : { rootPages: [...s.rootPages, id], currentPageId: id }
      })
      return id
    },

    addRow: (dbId, title = '', cells) => {
      const row = makeBlock('page', dbId, title)
      if (cells && Object.keys(cells).length) row.properties.cells = { ...cells }
      mutate((blocks) => {
        blocks[row.id] = row
        touch(blocks, dbId, { content: [...blocks[dbId].content, row.id] })
      })
      return row.id
    },

    setCell: (rowId, propId, value) =>
      mutate((blocks) => {
        const b = blocks[rowId]
        if (!b) return
        const cells = { ...b.properties.cells, [propId]: value }
        touch(blocks, rowId, { properties: { ...b.properties, cells } })
      }),

    duplicate: (id) => {
      let copyId = ''
      mutate((blocks, s) => {
        const parentId = blocks[id].parent_id
        copyId = duplicateTree(blocks, id, parentId)
        if (!parentId) {
          const roots = [...s.rootPages]
          roots.splice(roots.indexOf(id) + 1, 0, copyId)
          return { rootPages: roots }
        }
        const content = [...blocks[parentId].content]
        content.splice(content.indexOf(id) + 1, 0, copyId)
        touch(blocks, parentId, { content })
      })
      return copyId
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

    insertTree: ({ after, parent }, tree) => {
      const parentId = after ? get().blocks[after].parent_id! : parent!
      const made: Block[] = []
      const build = (t: BlockTree, pid: string): Block => {
        const b = makeBlock(t.type, pid, t.title ?? '')
        Object.assign(b.properties, t.properties)
        Object.assign(b.format, t.format)
        made.push(b)
        b.content = (t.children ?? []).map((c) => build(c, b.id).id)
        return b
      }
      const top = build(tree, parentId)
      mutate((blocks) => {
        for (const b of made) blocks[b.id] = b
        const content = [...blocks[parentId].content]
        content.splice(after ? content.indexOf(after) + 1 : content.length, 0, top.id)
        touch(blocks, parentId, { content })
      })
      return top.id
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
        // Options that only make sense for the old type.
        if (!HEADING_TYPES.includes(type)) delete format.toggleable
        if (type !== b.type && (type === 'numbered_list' || type === 'bulleted_list' || b.type === 'numbered_list' || b.type === 'bulleted_list')) {
          delete format.list_format
          delete format.list_start_index
        }
        if (type === 'code' && b.type !== 'code') properties.title = htmlToPlainText(properties.title)
        touch(blocks, id, { type, properties, format })
      }),

    toggleAll: (pageId) =>
      mutate((blocks) => {
        const toggles: string[] = []
        const walk = (id: string) => {
          for (const c of blocks[id]?.content ?? []) {
            const b = blocks[c]
            if (!b?.alive || b.type === 'page') continue
            if (b.type === 'toggle' || (HEADING_TYPES.includes(b.type) && b.format.toggleable)) toggles.push(c)
            walk(c)
          }
        }
        walk(pageId)
        // Any open → close all; all closed → open all.
        const collapse = toggles.some((t) => !blocks[t].format.collapsed)
        for (const t of toggles) touch(blocks, t, { format: { ...blocks[t].format, collapsed: collapse } })
      }),

    turnIntoPage: (id) =>
      mutate((blocks) => {
        const b = blocks[id]
        if (!b || b.type === 'page') return
        // The block becomes a sub-page; its nested blocks become the page's content.
        touch(blocks, id, { type: 'page', properties: { title: htmlToPlainText(b.properties.title) }, format: {} })
      }),

    // Soft delete, like Notion: pages go to trash, other blocks just disappear.
    removeBlock: (id) => {
      const b = get().blocks[id]
      if (b?.type === 'page') {
        // Like Notion: a 10-second toast that can take it back.
        set({ toast: { label: `Moved “${pageTitle(b)}” to trash`, action: { label: 'Undo', run: () => get().undo() } } })
      }
      mutate((blocks, s) => {
        const b = blocks[id]
        touch(blocks, id, { alive: false })
        if (b.type === 'page') {
          return {
            currentPageId: s.currentPageId === id ? b.parent_id ?? s.rootPages.find((p) => p !== id) ?? null : s.currentPageId,
          }
        }
        detach(blocks, id)
      })
    },

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
        if (parent.type === 'page' || parent.type === 'column' || !parent.parent_id) return
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

    placePage: (id, targetId, where) =>
      mutate((blocks, s) => {
        const b = blocks[id]
        const t = blocks[targetId]
        if (!b || !t || b.type !== 'page' || id === targetId) return
        const parentId = where === 'inside' ? targetId : t.parent_id
        if (parentId && blocks[parentId]?.schema) return
        for (let p = parentId; p; p = blocks[p]?.parent_id ?? null) if (p === id) return
        let rootPages = s.rootPages
        if (b.parent_id) detach(blocks, id)
        else rootPages = rootPages.filter((r) => r !== id)
        const list = [...(parentId ? blocks[parentId].content : rootPages)]
        const at = where === 'inside' ? list.length : list.indexOf(targetId) + (where === 'after' ? 1 : 0)
        list.splice(at, 0, id)
        if (parentId) touch(blocks, parentId, { content: list })
        else rootPages = list
        touch(blocks, id, { parent_id: parentId })
        return { rootPages }
      }),

    movePage: (id, parentId) =>
      mutate((blocks, s) => {
        const b = blocks[id]
        if (!b || b.type !== 'page' || b.parent_id === parentId) return
        for (let p = parentId; p; p = blocks[p]?.parent_id ?? null) if (p === id) return
        let rootPages = s.rootPages
        if (b.parent_id) detach(blocks, id)
        else rootPages = rootPages.filter((r) => r !== id)
        if (parentId) touch(blocks, parentId, { content: [...blocks[parentId].content, id] })
        else rootPages = [...rootPages, id]
        touch(blocks, id, { parent_id: parentId })
        return { rootPages }
      }),

    historyTick: 0,
    announcement: '',
    toast: null,

    undo: () => {
      const rev = undoStack.pop()
      if (!rev) return set({ announcement: 'Nothing to undo' })
      redoStack.push(revert(rev).inverse)
      set({ announcement: 'Undone' })
    },

    redo: () => {
      const rev = redoStack.pop()
      if (!rev) return set({ announcement: 'Nothing to redo' })
      undoStack.push(revert(rev).inverse)
      set({ announcement: 'Redone' })
    },

    transact: (fn) => {
      batchDepth++
      try {
        fn()
      } finally {
        if (--batchDepth === 0) batch = null
      }
    },

    beginCheckpoint: (name) => {
      checkpoint = name
    },
    endCheckpoint: (name) => {
      if (checkpoint === name) checkpoint = null
    },

    undoNamed: (name) => {
      const i = undoStack.findIndex((r) => r.name === name)
      if (i < 0) return null
      const [rev] = undoStack.splice(i, 1)
      const { inverse, restored, skipped } = revert(rev)
      redoStack.push(inverse)
      set({ announcement: 'Undone' })
      return { restored, skipped }
    },

    showToast: (toast) => set({ toast }),

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
      const toggleable = b.type === 'toggle' || (HEADING_TYPES.includes(b.type) && b.format.toggleable)
      if (b.type !== 'page' && !(toggleable && b.format.collapsed)) walk(c)
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

/** Whether a named undo step (e.g. an AI turn) is still on the undo stack. */
export function hasNamedStep(name: string) {
  return undoStack.some((r) => r.name === name && Object.keys(r.changes).length > 0)
}

/** Send any pending edits to the server now and wait for them (e.g. before restoring a version). */
export async function flushSaves() {
  writeNow()
  await inFlight
}

export function isServerMode() {
  return mode === 'server'
}

// Dev only: lets the screenshot helper open pages and views.
if (import.meta.env.DEV) (window as unknown as { __store: typeof useStore }).__store = useStore
