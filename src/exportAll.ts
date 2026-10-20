// Settings → Import & export: every page as Markdown in one .zip (folders follow the page tree),
// and a full backup of the workspace as JSON that can be restored later.

import { pageToMarkdown } from '../shared/blocks.ts'
import { pageTitle, useStore } from './store'
import type { Block } from './types'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A plain (uncompressed) zip file: small and enough for text. */
function zip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true)
    head.setUint16(4, 20, true)
    head.setUint16(6, 0x0800, true) // names are UTF-8
    head.setUint32(14, crc, true)
    head.setUint32(18, f.data.length, true)
    head.setUint32(22, f.data.length, true)
    head.setUint16(26, name.length, true)
    parts.push(new Uint8Array(head.buffer), name, f.data)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint16(8, 0x0800, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, f.data.length, true)
    dir.setUint32(24, f.data.length, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const size = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' })
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Untitled'
const stamp = () => new Date().toISOString().slice(0, 10)

/** Every live page (database rows included) as a .md file, in folders like the sidebar tree. */
export function exportAllMarkdown() {
  const { blocks, rootPages } = useStore.getState()
  const enc = new TextEncoder()
  const files: { name: string; data: Uint8Array }[] = []
  const used = new Set<string>()
  const walk = (id: string, dir: string) => {
    const page = blocks[id]
    if (!page?.alive || page.type !== 'page') return
    let base = dir + safe(pageTitle(page))
    for (let n = 2; used.has(base.toLowerCase()); n++) base = `${dir}${safe(pageTitle(page))} (${n})`
    used.add(base.toLowerCase())
    files.push({ name: `${base}.md`, data: enc.encode(pageToMarkdown(blocks, id)) })
    const kids = Object.values(blocks).filter((b: Block) => b.parent_id === id && b.type === 'page' && b.alive)
    for (const k of kids) walk(k.id, `${base}/`)
  }
  rootPages.forEach((id) => walk(id, ''))
  download(zip(files), `Notion(RE) export ${stamp()}.zip`)
  return files.length
}

/** The whole workspace (pages, databases, trash) as one JSON file. */
export function exportBackup() {
  const { blocks, rootPages } = useStore.getState()
  download(new Blob([JSON.stringify({ app: 'notion-re', version: 1, saved: Date.now(), rootPages, blocks })], { type: 'application/json' }), `Notion(RE) backup ${stamp()}.json`)
}

/** Put back pages from a backup: blocks that are missing or older here are restored, nothing is deleted. */
export async function restoreBackup(file: File) {
  const data = JSON.parse(await file.text())
  if (data?.app !== 'notion-re' || typeof data.blocks !== 'object') throw new Error('That file is not a Notion(RE) backup.')
  return useStore.getState().mergeBlocks(Object.values(data.blocks) as Block[])
}
