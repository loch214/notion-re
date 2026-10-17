// Page history: server-side snapshots of each page, modelled on Notion's version history
// (analysis/undo-and-history.md). Used by the sync server (your edits) and the MCP server
// (Claude's edits). Stored privately in data/history/<pageId>.json.
//
// When a version is saved (our own rule; Notion's cadence is server-side and not visible):
//   - the first time a page changes, its earlier state is saved too;
//   - when the author changes (you ↔ Claude), the previous author's last state is saved,
//     so every Claude turn and every stretch of your editing is its own version;
//   - while the same writer keeps editing, their latest version is updated in place (so a version
//     holds the end result of that stretch of editing), starting a new one every 10 minutes;
//   - identical content is never saved twice.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { htmlToPlain, type Workspace } from '../shared/blocks.ts'
import type { Block } from '../src/types.ts'

export type Author = 'You' | 'Claude' | 'Earlier'

export interface Version {
  /** Timestamp in ms, as a string id (also used as the version id). */
  id: string
  timestamp: number
  author: Author
  /** What changed compared with the previous version, in words. */
  summary: string
  /** Bookmark name, if the user named this version. */
  name?: string
  hash: string
  title: string
  /** Writer key ("You" / "Claude:<request>") — edits by the same writer update this version. */
  writer?: string
  /** Last time this version was updated. */
  updated?: number
  /** The page block plus every block inside it (sub-pages: only their link record). */
  blocks: Record<string, Block>
}

interface PageHistory {
  versions: Version[]
  /** Who wrote last: "You", or "Claude:<id>" for one Claude request (each request is its own writer). */
  lastWriter?: string
}

const authorOf = (writer: string | undefined): Author => (writer?.startsWith('Claude') ? 'Claude' : writer === 'You' ? 'You' : 'Earlier')

const INTERVAL_MS = 10 * 60 * 1000
const MAX_VERSIONS = 100

export function historyDir(dataFile: string) {
  return path.join(path.dirname(dataFile), 'history')
}

function fileFor(dataFile: string, pageId: string) {
  if (!/^[\w-]+$/.test(pageId)) throw new Error('Bad page id')
  return path.join(historyDir(dataFile), `${pageId}.json`)
}

function load(dataFile: string, pageId: string): PageHistory {
  try {
    return JSON.parse(fs.readFileSync(fileFor(dataFile, pageId), 'utf8'))
  } catch {
    return { versions: [] }
  }
}

function save(dataFile: string, pageId: string, h: PageHistory) {
  const file = fileFor(dataFile, pageId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(h))
  fs.renameSync(tmp, file)
}

/** The page whose history a block belongs to (a block's nearest page; a page is its own). */
export function pageOf(blocks: Record<string, Block>, id: string): string | null {
  for (let b: Block | undefined = blocks[id]; b; b = b.parent_id ? blocks[b.parent_id] : undefined) {
    if (b.type === 'page') return b.id
  }
  return null
}

/** Page + everything inside it. Sub-pages are kept as links only; a database keeps its rows' records. */
export function snapshotBlocks(blocks: Record<string, Block>, pageId: string): Record<string, Block> {
  const out: Record<string, Block> = {}
  const page = blocks[pageId]
  if (!page) return out
  out[pageId] = page
  const walk = (id: string) => {
    for (const c of blocks[id]?.content ?? []) {
      const b = blocks[c]
      if (!b || !b.alive) continue
      out[c] = b
      if (b.type !== 'page') walk(c)
    }
  }
  walk(pageId)
  return out
}

/** Content fingerprint, ignoring edit times (so touching a block without changing it isn't a version). */
function hashOf(snap: Record<string, Block>) {
  const norm = Object.keys(snap)
    .sort()
    .map((id) => {
      const { last_edited_time: _t, ...rest } = snap[id]
      return rest
    })
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex')
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Describe what changed between two snapshots of the same page, Notion-style. */
export function describeChanges(prev: Record<string, Block> | undefined, next: Record<string, Block>, pageId: string): string {
  if (!prev) return 'Saved version'
  const strip = ({ last_edited_time: _t, ...rest }: Block) => JSON.stringify(rest)
  const parts: string[] = []
  const p = prev[pageId]
  const n = next[pageId]
  if (p && n) {
    if (p.properties.title !== n.properties.title) parts.push('renamed the page')
    if (p.format.icon !== n.format.icon) parts.push('changed the icon')
    if (p.format.cover !== n.format.cover) parts.push('changed the cover')
    if (p.format.background !== n.format.background || p.format.page_font !== n.format.page_font || p.format.full_width !== n.format.full_width)
      parts.push('changed page settings')
    if (JSON.stringify(p.schema) !== JSON.stringify(n.schema)) parts.push('changed database properties')
  }
  let added = 0
  let removed = 0
  let edited = 0
  let moved = 0
  let recoloured = 0
  for (const id in next) {
    if (id === pageId) continue
    const a = prev[id]
    const b = next[id]
    if (!a) added++
    else if (strip(a) !== strip(b)) {
      if (a.parent_id !== b.parent_id) moved++
      else if (a.format.color !== b.format.color && a.properties.title === b.properties.title) recoloured++
      else edited++
    }
  }
  for (const id in prev) if (id !== pageId && !next[id]) removed++
  if (added) parts.push(`added ${plural(added, 'block')}`)
  if (edited) parts.push(`edited ${plural(edited, 'block')}`)
  if (removed) parts.push(`removed ${plural(removed, 'block')}`)
  if (moved) parts.push(`moved ${plural(moved, 'block')}`)
  if (recoloured) parts.push('changed color')
  return parts.length ? parts.join(', ') : 'No visible changes'
}

function addVersion(h: PageHistory, pageId: string, snap: Record<string, Block>, author: Author, now: number, summary?: string) {
  const hash = hashOf(snap)
  const last = h.versions.at(-1)
  if (last?.hash === hash) return
  const id = String(Math.max(now, (last?.timestamp ?? 0) + 1))
  h.versions.push({
    id,
    timestamp: Number(id),
    author,
    summary: summary ?? describeChanges(last?.blocks, snap, pageId),
    hash,
    title: htmlToPlain(snap[pageId]?.properties.title ?? '') || 'Untitled',
    blocks: snap,
  })
  // Keep named versions; drop the oldest unnamed ones beyond the limit.
  while (h.versions.length > MAX_VERSIONS) {
    const i = h.versions.findIndex((v) => !v.name)
    if (i < 0) break
    h.versions.splice(i, 1)
  }
}

/**
 * Call after every write to the workspace file. `changedIds` = blocks the write touched.
 * Saves new versions of the affected pages according to the rules at the top of this file.
 */
export function recordWrite(dataFile: string, before: Workspace | null, after: Workspace, changedIds: Iterable<string>, writer: string) {
  const author = authorOf(writer)
  const pages = new Set<string>()
  for (const id of changedIds) {
    const p = pageOf(after.blocks, id) ?? (before ? pageOf(before.blocks, id) : null)
    if (p) pages.add(p)
  }
  const now = Date.now()
  for (const pageId of pages) {
    try {
      const h = load(dataFile, pageId)
      const last = h.versions.at(-1)
      const prevWriter = h.lastWriter
      if (before?.blocks[pageId] && (!last || (prevWriter && prevWriter !== writer))) {
        // Keep the state as it was before this writer started.
        addVersion(h, pageId, snapshotBlocks(before.blocks, pageId), authorOf(prevWriter), now - 1, last ? undefined : 'Earlier version')
      }
      const latest = h.versions.at(-1)
      const snap = after.blocks[pageId] ? snapshotBlocks(after.blocks, pageId) : null
      if (snap && latest && latest.writer === writer && prevWriter === writer && now - latest.timestamp < INTERVAL_MS && !latest.name) {
        // Same stretch of editing: keep this version up to date with the latest state.
        const prev = h.versions.at(-2)
        latest.blocks = snap
        latest.hash = hashOf(snap)
        latest.title = htmlToPlain(snap[pageId]?.properties.title ?? '') || 'Untitled'
        if (latest.summary !== 'Created the page') latest.summary = describeChanges(prev?.blocks, snap, pageId)
        latest.updated = now
        // Edits that put the page back exactly as the previous version: drop the duplicate.
        if (prev && prev.hash === latest.hash) h.versions.pop()
      } else if (snap) {
        const created = !before?.blocks[pageId]
        addVersion(h, pageId, snap, author, now, created ? 'Created the page' : undefined)
        const v = h.versions.at(-1)
        if (v && v.timestamp >= now) v.writer = writer
      }
      h.lastWriter = writer
      save(dataFile, pageId, h)
    } catch (e) {
      // History must never break saving the workspace itself.
      console.error('[history]', pageId, e)
    }
  }
}

/** Version list without block contents (newest first). */
export function listVersions(dataFile: string, pageId: string) {
  return load(dataFile, pageId)
    .versions.map(({ blocks: _b, hash: _h, ...v }) => v)
    .reverse()
}

export function getVersion(dataFile: string, pageId: string, versionId: string): Version | undefined {
  return load(dataFile, pageId).versions.find((v) => v.id === versionId)
}

export function nameVersion(dataFile: string, pageId: string, versionId: string, name: string | null) {
  const h = load(dataFile, pageId)
  const v = h.versions.find((x) => x.id === versionId)
  if (!v) throw new Error('Version not found')
  if (name?.trim()) v.name = name.trim().slice(0, 100)
  else delete v.name
  save(dataFile, pageId, h)
}

/**
 * Put a page back to a saved version (mutates `ws`). The current state is saved as a version first,
 * so a restore can always be undone by restoring again. Returns the ids of blocks it changed.
 */
export function restoreVersion(dataFile: string, ws: Workspace, pageId: string, versionId: string): string[] {
  const v = getVersion(dataFile, pageId, versionId)
  if (!v) throw new Error('Version not found')
  if (!ws.blocks[pageId]) throw new Error('Page not found')

  // Save the current state first (as its own version, by whoever wrote it last).
  const h = load(dataFile, pageId)
  addVersion(h, pageId, snapshotBlocks(ws.blocks, pageId), authorOf(h.lastWriter), Date.now() - 1)
  save(dataFile, pageId, h)

  const now = Date.now()
  const changed = new Set<string>()
  const touch = (id: string, b: Block) => {
    ws.blocks[id] = { ...b, last_edited_time: now }
    changed.add(id)
  }
  const current = snapshotBlocks(ws.blocks, pageId)

  // 1. Blocks added since that version: remove them (pages go to the trash, like deleting).
  for (const id in current) {
    if (id !== pageId && !v.blocks[id]) {
      const b = ws.blocks[id]
      touch(id, { ...b, alive: false })
      const parent = b.parent_id ? ws.blocks[b.parent_id] : undefined
      if (parent && b.type !== 'page') touch(parent.id, { ...ws.blocks[parent.id], content: ws.blocks[parent.id].content.filter((c) => c !== id) })
    }
  }
  // 2. Blocks in that version: put them back. Content moved to other pages comes back here.
  for (const [id, old] of Object.entries(v.blocks)) {
    const cur = ws.blocks[id]
    if (cur && cur.parent_id && cur.parent_id !== old.parent_id && ws.blocks[cur.parent_id] && !v.blocks[cur.parent_id]) {
      const from = ws.blocks[cur.parent_id]
      touch(from.id, { ...from, content: from.content.filter((c) => c !== id) })
    }
    if (id === pageId) {
      // The page itself: its content and look come back, but it stays where it is in the tree.
      touch(id, { ...old, alive: true, parent_id: cur?.parent_id ?? old.parent_id })
    } else if (old.type === 'page' && cur) {
      // A sub-page or database row: bring its link back but leave its own content to its own history.
      // Database rows also get their values back (like Notion's "Restore property values for all records").
      const isRow = !!v.blocks[pageId].schema && old.parent_id === pageId
      touch(id, { ...cur, alive: true, parent_id: old.parent_id, ...(isRow ? { properties: old.properties } : {}) })
    } else {
      touch(id, { ...old, alive: true })
    }
  }
  return [...changed]
}
