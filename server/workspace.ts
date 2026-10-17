// File-backed workspace storage shared by the sync server and the MCP server.
// The JSON file is the single source of truth; every writer does a quick
// read-modify-write with an atomic rename, so the two processes can coexist.

import fs from 'node:fs'
import path from 'node:path'
import type { Workspace } from '../shared/blocks.ts'
import type { Block } from '../src/types.ts'

export function loadWorkspace(file: string): Workspace | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e: any) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

export function saveWorkspace(file: string, ws: Workspace) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(ws))
  fs.renameSync(tmp, file)
}

export interface SyncPayload {
  blocks: Block[]
  deleted: string[]
  rootPages: string[]
}

/** Merge a client's changes: per block, the most recently edited version wins. */
export function applySync(ws: Workspace | null, p: SyncPayload): Workspace {
  const blocks = { ...(ws?.blocks ?? {}) }
  for (const b of p.blocks) {
    const cur = blocks[b.id]
    if (!cur || b.last_edited_time >= cur.last_edited_time) blocks[b.id] = b
  }
  for (const id of p.deleted) delete blocks[id]
  // Keep the client's page order, plus any top-level pages only the server knows about.
  const roots = [...p.rootPages, ...(ws?.rootPages ?? []).filter((id) => !p.rootPages.includes(id))]
  return { blocks, rootPages: roots.filter((id) => blocks[id]) }
}
