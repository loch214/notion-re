// Inbox: Notion's notification panel next to the sidebar. Here it holds reminders that came due.

import { useEffect } from 'react'
import { formatDateValue } from '../../shared/dates'
import { dueReminders, isRead, markRead, useInboxVersion } from '../reminders'
import { pageTitle, useStore } from '../store'
import { Icon } from './Icons'

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function useUnreadCount() {
  useInboxVersion()
  const blocks = useStore((s) => s.blocks)
  return dueReminders(blocks).filter((r) => !isRead(r.key)).length
}

export function InboxPanel({ left, onClose }: { left: number; onClose: () => void }) {
  useInboxVersion()
  const blocks = useStore((s) => s.blocks)
  const items = dueReminders(blocks)
  const unread = items.filter((r) => !isRead(r.key))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="inbox-backdrop" onClick={onClose} />
      <aside className="inbox" style={{ left }}>
        <header className="inbox-head">
          <b>Inbox</b>
          <span style={{ flex: 1 }} />
          {unread.length > 0 && (
            <button className="ctl inbox-markall" title="Mark all as read" onClick={() => markRead(unread.map((r) => r.key))}>
              <Icon name="check" size={16} />
            </button>
          )}
          <button className="ctl" title="Close" onClick={onClose}><Icon name="collapse" size={16} /></button>
        </header>
        <div className="inbox-list">
          {items.length === 0 ? (
            <div className="inbox-empty">
              <Icon name="inbox" size={32} />
              <b>You’re all caught up</b>
              <span>Reminders you set on dates show up here when they’re due.</span>
            </div>
          ) : (
            items.map((r) => {
              const read = isRead(r.key)
              return (
                <button
                  key={r.key}
                  className={`inbox-item ${read ? '' : 'unread'}`}
                  onClick={() => {
                    markRead([r.key])
                    useStore.getState().openPage(r.row.id)
                    onClose()
                  }}
                >
                  <span className="inbox-ic"><Icon name="bell" size={16} /></span>
                  <span className="inbox-body">
                    <span className="inbox-line">
                      <span className="inbox-title">Reminder</span>
                      <span className="inbox-time">{ago(r.at)}</span>
                    </span>
                    <span className="inbox-page">{r.row.format.icon ?? '📄'} {pageTitle(r.row)}</span>
                    <span className="inbox-meta">{r.prop && r.db ? `${r.prop.name}: ${formatDateValue(r.value, r.prop)} · ${pageTitle(r.db)}` : r.text}</span>
                  </span>
                  {!read && <span className="inbox-dot" />}
                </button>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}
