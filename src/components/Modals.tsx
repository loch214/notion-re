import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { activeModel, PROVIDERS, streamChat } from '../ai'
import { htmlToText } from '../markdown'
import { pagePath, pageTitle, useStore } from '../store'
import type { AIProvider, AISettings } from '../types'

function Modal({ title, onClose, children, wide }: { title?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        {title && <div className="modal-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const saved = useStore((s) => s.settings)
  const saveSettings = useStore((s) => s.saveSettings)
  const [s, setS] = useState<AISettings>(saved)
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; msg?: string }>({ state: 'idle' })

  const p = s.provider
  const update = (patch: Partial<AISettings>) => {
    setS({ ...s, ...patch })
    setTest({ state: 'idle' })
  }

  const runTest = async () => {
    setTest({ state: 'running' })
    try {
      let reply = ''
      await streamChat(s, [{ role: 'user', content: 'Reply with exactly: OK' }], (t) => (reply += t), undefined, 'You are a connection test.')
      setTest({ state: 'ok', msg: `Connected — ${activeModel(s)} replied "${reply.trim().slice(0, 40)}"` })
    } catch (e: any) {
      setTest({ state: 'fail', msg: e.message })
    }
  }

  return (
    <Modal title="Settings · AI" onClose={onClose}>
      <p className="muted small">
        Notion(RE) calls your AI provider directly from this browser. Keys are stored only in this browser's local
        database and are never uploaded anywhere else.
      </p>

      <label className="field">
        <span>Provider</span>
        <select value={p} onChange={(e) => update({ provider: e.target.value as AIProvider })}>
          {Object.entries(PROVIDERS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </label>

      {p === 'openai-compatible' && (
        <label className="field">
          <span>Base URL</span>
          <input
            value={s.baseUrl}
            placeholder="https://openrouter.ai/api/v1  or  http://localhost:11434/v1"
            onChange={(e) => update({ baseUrl: e.target.value })}
          />
        </label>
      )}

      <label className="field">
        <span>API key</span>
        <input
          type="password"
          autoComplete="off"
          value={s.apiKeys[p] ?? ''}
          placeholder={PROVIDERS[p].keyHint}
          onChange={(e) => update({ apiKeys: { ...s.apiKeys, [p]: e.target.value.trim() } })}
        />
      </label>

      <label className="field">
        <span>Model</span>
        <input
          value={s.models[p] ?? ''}
          placeholder={PROVIDERS[p].defaultModel || 'e.g. llama3.1, anthropic/claude-sonnet-5-5'}
          onChange={(e) => update({ models: { ...s.models, [p]: e.target.value.trim() } })}
        />
      </label>

      {test.state !== 'idle' && (
        <div className={`test-result ${test.state}`}>
          {test.state === 'running' ? 'Testing connection…' : test.msg}
        </div>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={runTest} disabled={test.state === 'running'}>Test connection</button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          onClick={() => {
            saveSettings(s)
            onClose()
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  )
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const openPage = useStore((s) => s.openPage)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  // Search page titles and block text; results point at the containing page.
  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    const pageOf = (id: string): string | null => {
      for (let b = blocks[id]; b; b = blocks[b.parent_id!]) if (b.type === 'page') return b.id
      return null
    }
    const isAlive = (id: string) => {
      for (let b = blocks[id]; b; b = blocks[b.parent_id!]) if (!b.alive) return false
      return true
    }
    const seen = new Map<string, string>()
    for (const b of Object.values(blocks)) {
      if (!isAlive(b.id)) continue
      const text = b.type === 'page' ? b.properties.title : htmlToText(b.properties.title)
      if (query && !text.toLowerCase().includes(query)) continue
      if (!query && b.type !== 'page') continue
      const pid = pageOf(b.id)
      if (pid && !seen.has(pid)) seen.set(pid, b.type === 'page' ? '' : text)
    }
    return [...seen.entries()]
      .map(([id, snippet]) => ({ id, snippet }))
      .sort((a, b) => blocks[b.id].last_edited_time - blocks[a.id].last_edited_time)
      .slice(0, 30)
  }, [q, blocks])

  const go = (id: string) => {
    openPage(id)
    onClose()
  }

  return (
    <Modal onClose={onClose} wide>
      <input
        ref={inputRef}
        className="search-input"
        placeholder="Search pages and content…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1))
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
          if (e.key === 'Enter' && results[active]) go(results[active].id)
        }}
      />
      <div className="search-results">
        {results.length === 0 && <div className="menu-empty">No results</div>}
        {results.map((r, i) => (
          <div key={r.id} className={`menu-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(r.id)}>
            <span className="menu-icon">{blocks[r.id].format.icon ?? '📄'}</span>
            <span>
              <div className="menu-label">{pageTitle(blocks[r.id])}</div>
              <div className="menu-hint">
                {r.snippet ? r.snippet.slice(0, 90) : pagePath(blocks, r.id).slice(0, -1).map((p) => pageTitle(p)).join(' / ')}
              </div>
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function TrashModal({ onClose }: { onClose: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const { restorePage, purgePage } = useStore.getState()
  const trashed = Object.values(blocks)
    .filter((b) => b.type === 'page' && !b.alive)
    .sort((a, b) => b.last_edited_time - a.last_edited_time)

  return (
    <Modal title="Trash" onClose={onClose}>
      {trashed.length === 0 && <div className="menu-empty">Trash is empty</div>}
      {trashed.map((p) => (
        <div key={p.id} className="trash-row">
          <span>{p.format.icon ?? '📄'} {pageTitle(p)}</span>
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={() => restorePage(p.id)}>Restore</button>
          <button className="btn small danger" onClick={() => purgePage(p.id)}>Delete forever</button>
        </div>
      ))}
    </Modal>
  )
}
