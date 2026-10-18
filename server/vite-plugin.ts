// Vite plugin that serves the local workspace API:
//   GET  /api/workspace  → whole workspace (or null if none yet)
//   POST /api/sync       → merge a client's changed blocks
//   GET  /api/events     → Server-Sent Events: "change" whenever the file changes
//                          (from any tab, or from Claude via the MCP server)
//   GET  /api/history?page=ID            → saved versions of a page (newest first)
//   GET  /api/history/version?page=&id=  → one version's blocks
//   POST /api/history/restore {page, id} → put the page back to that version
//   POST /api/history/name {page, id, name} → bookmark (name) a version, or clear the name

import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { claudeBridge } from './claude-bridge.ts'
import { getVersion, listVersions, nameVersion, recordWrite, restoreVersion } from './history.ts'
import { applySync, loadWorkspace, saveWorkspace } from './workspace.ts'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/** Block other websites from writing to the workspace through the user's browser. */
function crossOrigin(req: IncomingMessage) {
  const origin = req.headers.origin
  return !!origin && new URL(origin).host !== req.headers.host
}

function setup(root: string, middlewares: Connect.Server) {
  const file = path.resolve(root, 'data', 'workspace.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })

  const clients = new Set<ServerResponse>()
  let timer: ReturnType<typeof setTimeout> | undefined
  fs.watch(path.dirname(file), (_event, name) => {
    if (name !== 'workspace.json') return
    clearTimeout(timer)
    timer = setTimeout(() => clients.forEach((c) => c.write('data: change\n\n')), 80)
  })

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  middlewares.use('/api/workspace', (req, res) => {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' })
    json(res, 200, loadWorkspace(file))
  })

  // Uploaded images / videos / files: saved under data/files, served back by name.
  const filesDir = path.resolve(root, 'data', 'files')
  const TYPES: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf',
  }
  middlewares.use('/api/files', async (req, res) => {
    if (req.method === 'GET') {
      const name = path.basename(decodeURIComponent((req.url ?? '').slice(1)))
      const ext = name.split('.').pop()!.toLowerCase()
      const p = path.join(filesDir, name)
      if (!fs.existsSync(p)) return json(res, 404, { error: 'Not found' })
      // SVGs can carry scripts: serve them so the browser won't run any.
      res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'x-content-type-options': 'nosniff' })
      return void fs.createReadStream(p).pipe(res)
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'GET or POST' })
    if (crossOrigin(req)) return json(res, 403, { error: 'Cross-origin write refused' })
    const ext = String(req.headers['x-file-ext'] ?? '').toLowerCase()
    if (!TYPES[ext]) return json(res, 400, { error: 'Unsupported file type' })
    const chunks: Buffer[] = []
    let size = 0
    for await (const c of req) {
      size += c.length
      if (size > 50 * 1024 * 1024) return json(res, 413, { error: 'File too large (max 50 MB)' })
      chunks.push(c)
    }
    fs.mkdirSync(filesDir, { recursive: true })
    const name = `${crypto.randomUUID().slice(0, 12)}.${ext}`
    fs.writeFileSync(path.join(filesDir, name), Buffer.concat(chunks))
    json(res, 200, { url: `/api/files/${name}` })
  })

  middlewares.use('/api/sync', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
    if (crossOrigin(req)) return json(res, 403, { error: 'Cross-origin write refused' })
    try {
      const payload = JSON.parse(await readBody(req))
      const before = loadWorkspace(file)
      const after = applySync(before, payload)
      saveWorkspace(file, after)
      recordWrite(file, before, after, [...payload.blocks.map((b: { id: string }) => b.id), ...payload.deleted], 'You')
      json(res, 200, { ok: true })
    } catch (e: any) {
      json(res, 400, { error: e.message })
    }
  })

  middlewares.use('/api/history', async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      if (req.method === 'GET') {
        const page = url.searchParams.get('page') ?? ''
        if (url.pathname === '/') return json(res, 200, listVersions(file, page))
        if (url.pathname === '/version') {
          const v = getVersion(file, page, url.searchParams.get('id') ?? '')
          return v ? json(res, 200, v) : json(res, 404, { error: 'Version not found' })
        }
        return json(res, 404, { error: 'Not found' })
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'GET or POST only' })
      if (crossOrigin(req)) return json(res, 403, { error: 'Cross-origin write refused' })
      const body = JSON.parse(await readBody(req))
      if (url.pathname === '/restore') {
        const before = loadWorkspace(file)
        if (!before) return json(res, 404, { error: 'No workspace' })
        const after = structuredClone(before)
        const changed = restoreVersion(file, after, String(body.page), String(body.id))
        saveWorkspace(file, after)
        recordWrite(file, before, after, changed, 'You')
        return json(res, 200, { ok: true, changed: changed.length })
      }
      if (url.pathname === '/name') {
        nameVersion(file, String(body.page), String(body.id), body.name ?? null)
        return json(res, 200, { ok: true })
      }
      json(res, 404, { error: 'Not found' })
    } catch (e: any) {
      json(res, 400, { error: e.message })
    }
  })

  claudeBridge(root, middlewares)

  middlewares.use('/api/events', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write(': connected\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
  })
}

export function workspaceApi(): Plugin {
  return {
    name: 'notion-re-workspace-api',
    configureServer(server) {
      setup(server.config.root, server.middlewares)
    },
    configurePreviewServer(server) {
      setup(server.config.root, server.middlewares)
    },
  }
}
