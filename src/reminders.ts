// Reminders: when a reminder on a date comes due it lands in the Inbox (unread until opened)
// and pops a desktop notification, like Notion's "Remind" → Inbox.

import { useEffect, useSyncExternalStore } from 'react'
import { dbRows } from '../shared/blocks.ts'
import { remindAt } from '../shared/dates'
import { pageTitle, useStore } from './store'
import type { Block, DbProperty } from './types'

export interface Reminder {
  /** Changes when the date or reminder changes, so a moved date reminds again. */
  key: string
  row: Block
  db: Block
  prop: DbProperty
  value: string
  at: number
}

const READ_KEY = 'notion-re:inbox-read'
const SHOWN_KEY = 'notion-re:reminders-shown'
const listeners = new Set<() => void>()
const readSet = (k: string) => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(k) ?? '[]'))
  } catch {
    return new Set<string>()
  }
}
const writeSet = (k: string, s: Set<string>) => {
  localStorage.setItem(k, JSON.stringify([...s].slice(-500)))
  listeners.forEach((l) => l())
}

/** Every reminder in the workspace, past and future, newest first. */
export function allReminders(blocks: Record<string, Block>): Reminder[] {
  const out: Reminder[] = []
  for (const db of Object.values(blocks)) {
    if (!db.alive || !db.schema) continue
    for (const row of dbRows(blocks, db)) {
      const rem = row.properties.reminders
      if (!rem) continue
      for (const [propId, minutes] of Object.entries(rem)) {
        const prop = db.schema.find((p) => p.id === propId && p.type === 'date')
        const value = row.properties.cells?.[propId]
        const at = prop ? remindAt(value, minutes) : null
        if (prop && at !== null) out.push({ key: `${row.id}:${propId}:${value}:${minutes}`, row, db, prop, value: value as string, at })
      }
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

/** Reminders that have come due (the Inbox). */
export const dueReminders = (blocks: Record<string, Block>) => allReminders(blocks).filter((r) => r.at <= Date.now())

export function isRead(key: string) {
  return readSet(READ_KEY).has(key)
}
export function markRead(keys: string[]) {
  const s = readSet(READ_KEY)
  keys.forEach((k) => s.add(k))
  writeSet(READ_KEY, s)
}

/** Re-renders when read state changes. */
export function useInboxVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => localStorage.getItem(READ_KEY) ?? '',
  )
}

/** Ask once for permission to show desktop notifications (called when a reminder is set). */
export function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
}

/** Checks every 30 s; a reminder that just came due shows a toast and a desktop notification once. */
export function useReminderTicker(onOpenInbox: () => void) {
  useEffect(() => {
    const tick = () => {
      const S = useStore.getState()
      const shown = readSet(SHOWN_KEY)
      // Only announce recent ones; older due reminders just sit in the Inbox.
      const fresh = dueReminders(S.blocks).filter((r) => !shown.has(r.key) && Date.now() - r.at < 6 * 3600_000)
      if (!fresh.length) return
      fresh.forEach((r) => shown.add(r.key))
      writeSet(SHOWN_KEY, shown)
      const first = fresh[0]
      const label = `Reminder: ${pageTitle(first.row)}${fresh.length > 1 ? ` and ${fresh.length - 1} more` : ''}`
      S.showToast({ label, action: { label: 'Open', run: onOpenInbox } })
      if ('Notification' in window && Notification.permission === 'granted') {
        for (const r of fresh.slice(0, 3)) {
          const n = new Notification(pageTitle(r.row), { body: `Reminder · ${pageTitle(r.db)}`, tag: r.key })
          n.onclick = () => {
            window.focus()
            markRead([r.key])
            useStore.getState().openPage(r.row.id)
          }
        }
      }
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [onOpenInbox])
}
