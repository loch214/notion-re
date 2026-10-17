// Vite plugin that serves the local workspace API:
//   GET  /api/workspace  → whole workspace (or null if none yet)
//   POST /api/sync       → merge a client's changed blocks
//   GET  /api/events     → Server-Sent Events: "change" whenever the file changes
//                          (from any tab, or from Claude via the MCP server)

import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { claudeBridge } from './claude-bridge.ts'
import { applySync, loadWorkspace, saveWorkspace } from './workspace.ts'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
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

  middlewares.use('/api/sync', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
    // Block other websites from writing to the workspace through the user's browser.
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin write refused' })
    try {
      const payload = JSON.parse(await readBody(req))
      saveWorkspace(file, applySync(loadWorkspace(file), payload))
      json(res, 200, { ok: true })
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
