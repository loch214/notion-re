// Saved AI panel chats, one JSON file per chat in <data>/chats/<id>.json (next to workspace.json).
// A chat keeps its messages for display plus Claude's session id, so reopening it can continue with --resume.

import fs from 'node:fs'
import path from 'node:path'

export interface SavedChat {
  id: string
  title: string
  created: number
  updated: number
  /** Claude Code session id ("claude-code" provider) for continuing the conversation. */
  sessionId?: string
  messages: unknown[]
}

const ID = /^[\w-]{6,64}$/

export function chatStore(dataFile: string) {
  const dir = path.join(path.dirname(dataFile), 'chats')
  const fileOf = (id: string) => {
    if (!ID.test(id)) throw new Error('Bad chat id')
    return path.join(dir, `${id}.json`)
  }
  const read = (id: string): SavedChat | null => {
    try {
      return JSON.parse(fs.readFileSync(fileOf(id), 'utf8'))
    } catch {
      return null
    }
  }
  return {
    /** Newest first, without the messages. */
    list() {
      if (!fs.existsSync(dir)) return []
      return fs
        .readdirSync(dir)
        .filter((n) => n.endsWith('.json'))
        .map((n) => read(n.slice(0, -5)))
        .filter((c): c is SavedChat => !!c)
        .map(({ id, title, created, updated }) => ({ id, title, created, updated }))
        .sort((a, b) => b.updated - a.updated)
    },
    get: read,
    save(chat: SavedChat) {
      const old = read(chat.id)
      const next: SavedChat = {
        id: chat.id,
        title: String(chat.title ?? '').slice(0, 200) || 'New chat',
        created: old?.created ?? Date.now(),
        updated: Date.now(),
        sessionId: typeof chat.sessionId === 'string' ? chat.sessionId : undefined,
        messages: Array.isArray(chat.messages) ? chat.messages : [],
      }
      fs.mkdirSync(dir, { recursive: true })
      const tmp = fileOf(chat.id) + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(next))
      fs.renameSync(tmp, fileOf(chat.id))
      return next
    },
    rename(id: string, title: string) {
      const c = read(id)
      if (!c) return null
      c.title = title.slice(0, 200) || 'New chat'
      fs.writeFileSync(fileOf(id), JSON.stringify(c))
      return c
    },
    remove(id: string) {
      fs.rmSync(fileOf(id), { force: true })
    },
  }
}
