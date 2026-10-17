// Page history window, laid out like Notion's version history: a preview of the selected
// version, the list of versions grouped by day, bookmarks, and a restore panel.

import { useEffect, useMemo, useState } from 'react'
import { pageToMarkdown } from '../markdown'
import { flushSaves, isServerMode, pageTitle, useStore } from '../store'
import type { Block } from '../types'
import { Markdown } from './Markdown'

interface VersionInfo {
  id: string
  timestamp: number
  author: 'You' | 'Claude' | 'Earlier'
  summary: string
  name?: string
  title: string
}

const CURRENT = 'current'

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const full = (ts: number) => new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

function dayLabel(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const data = await r.json()
  if (!r.ok) throw new Error(data.error ?? r.statusText)
  return data
}

export function HistoryModal({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const page = useStore((s) => s.blocks[pageId])
  const blocks = useStore((s) => s.blocks)
  const [versions, setVersions] = useState<VersionInfo[] | null>(null)
  const [selected, setSelected] = useState<string>(CURRENT)
  const [preview, setPreview] = useState<Record<string, Block> | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      await flushSaves()
      setVersions(await api<VersionInfo[]>(`/api/history?page=${encodeURIComponent(pageId)}`))
    } catch (e: any) {
      setError(e.message)
    }
  }
  useEffect(() => {
    if (isServerMode()) load()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  useEffect(() => {
    setRestoring(false)
    if (selected === CURRENT) return setPreview(null)
    setPreview(null)
    api<{ blocks: Record<string, Block> }>(`/api/history/version?page=${encodeURIComponent(pageId)}&id=${selected}`)
      .then((v) => setPreview(v.blocks))
      .catch((e) => setError(e.message))
  }, [selected, pageId])

  const groups = useMemo(() => {
    const out: { label: string; items: VersionInfo[] }[] = []
    for (const v of versions ?? []) {
      const label = dayLabel(v.timestamp)
      if (out.at(-1)?.label !== label) out.push({ label, items: [] })
      out.at(-1)!.items.push(v)
    }
    return out
  }, [versions])

  const sel = versions?.find((v) => v.id === selected)
  const markdown = selected === CURRENT ? pageToMarkdown(blocks, pageId) : preview ? pageToMarkdown(preview, pageId) : ''

  const restore = async () => {
    if (!sel) return
    const S = useStore.getState()
    // Like any edit, a restore can be taken back with Ctrl+Z (the changes arrive over live sync).
    const name = `restore-${Date.now()}`
    try {
      await flushSaves()
      S.beginCheckpoint(name)
      await api('/api/history/restore', { page: pageId, id: sel.id })
      setTimeout(() => S.endCheckpoint(name), 2000)
      S.showToast({
        label: `Restored “${pageTitle(page)}” to ${full(sel.timestamp)}`,
        action: { label: 'Undo', run: () => useStore.getState().undoNamed(name) },
      })
      onClose()
    } catch (e: any) {
      S.endCheckpoint(name)
      setError(e.message)
    }
  }

  const saveName = async (id: string, name: string) => {
    try {
      await api('/api/history/name', { page: pageId, id, name })
      setNaming(null)
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal history-modal" role="dialog" aria-label="Page history">
        <div className="history-main">
          <div className="history-head">
            <div>
              <div className="history-title">{selected === CURRENT ? 'Current version' : sel?.name ?? (sel ? full(sel.timestamp) : '')}</div>
              {sel && <div className="muted small">{sel.author} · {sel.summary}</div>}
            </div>
            <span style={{ flex: 1 }} />
            {sel && (
              <button className="btn small" onClick={() => setNaming(sel.id)}>
                {sel.name ? '★ Rename bookmark' : '☆ Bookmark'}
              </button>
            )}
            <button
              className="btn primary small"
              disabled={!sel}
              title={sel ? undefined : 'This is already the current version of the page'}
              onClick={() => setRestoring(true)}
            >
              Restore
            </button>
            <button className="ctl" title="Close version history" onClick={onClose}>✕</button>
          </div>

          {naming && (
            <form
              className="history-name"
              onSubmit={(e) => {
                e.preventDefault()
                saveName(naming, (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value)
              }}
            >
              <span className="small">Name this version</span>
              <input name="name" autoFocus defaultValue={versions?.find((v) => v.id === naming)?.name ?? ''} placeholder="e.g. Before Claude's rewrite" />
              <button className="btn small primary">Save</button>
              <button type="button" className="btn small" onClick={() => setNaming(null)}>Cancel</button>
            </form>
          )}

          {restoring && sel && (
            <div className="history-restore">
              <div>
                <b>Restore “{pageTitle(page)}”</b> to {full(sel.timestamp)}
              </div>
              <div className="muted small">What will be restored</div>
              <ul className="small">
                <li><b>All page content</b> — text, blocks and other content on this page. Blocks added since are removed.</li>
                <li><b>Moved content</b> — content moved to other pages comes back here.</li>
                <li><b>Page look</b> — icon, cover, background, font and width.</li>
                {page?.schema && <li><b>Database</b> — columns, rows and their values (rows' own page content is not restored).</li>}
              </ul>
              <div className="muted small">This will not delete any other versions, and you can always restore again (or press Ctrl+Z).</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={restore}>Restore this version</button>
                <button className="btn" onClick={() => setRestoring(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="history-preview">
            {error && <div className="ai-error">{error}</div>}
            {!isServerMode() ? (
              <p className="muted">Page history needs the local server (npm run dev).</p>
            ) : selected !== CURRENT && !preview ? (
              <p className="muted">Loading…</p>
            ) : (
              <Markdown text={markdown} />
            )}
          </div>
        </div>

        <aside className="history-side">
          <div className={`history-item ${selected === CURRENT ? 'active' : ''}`} onClick={() => setSelected(CURRENT)}>
            <div className="history-item-time">Current version</div>
            <div className="muted small">Live page</div>
          </div>
          {versions === null && isServerMode() && <div className="muted small history-group">Loading…</div>}
          {versions?.length === 0 && <div className="muted small history-group">No saved versions yet. Versions are saved as the page changes.</div>}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="history-group">{g.label}</div>
              {g.items.map((v) => (
                <div key={v.id} className={`history-item ${selected === v.id ? 'active' : ''}`} onClick={() => setSelected(v.id)}>
                  <div className="history-item-time">
                    {v.name ? `★ ${v.name}` : time(v.timestamp)}
                    <span className={`history-author author-${v.author.toLowerCase()}`}>{v.author}</span>
                  </div>
                  <div className="muted small">{v.name ? `${time(v.timestamp)} · ` : ''}{v.summary}</div>
                </div>
              ))}
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}
