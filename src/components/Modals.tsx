import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { activeModel, claudeStatus, PROVIDERS, streamChat, type ClaudeStatus } from '../ai'
import { htmlToText } from '../markdown'
import { pagePath, pageTitle, START_PAGE_KEY, useStore } from '../store'
import { setThemePref, useThemePref, type ThemePref } from '../theme'
import type { AIProvider, AISettings } from '../types'
import { Switch } from './DatePicker'
import { weekStartsMonday } from '../../shared/dates'
import { initials, setProfileName, useProfileName } from '../profile'
import { Dropdown } from './Dropdown'
import { Icon, type IconName } from './Icons'
import { importMarkdown } from './Sidebar'

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

type SettingsTab = 'account' | 'preferences' | 'ai' | 'import' | 'shortcuts'

/** One settings row: name + description on the left, the control on the right (Notion's layout). */
function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-title">{title}</div>
        {desc && <div className="set-row-desc">{desc}</div>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function AccountPane() {
  const name = useProfileName()
  const [draft, setDraft] = useState(name)
  return (
    <>
      <Section title="My profile">
        <div className="set-profile">
          <span className="avatar large">{initials(draft)}</span>
          <label className="set-field">
            <span>Preferred name</span>
            <input className="input" value={draft} placeholder="Your name" onChange={(e) => setDraft(e.target.value)} onBlur={() => setProfileName(draft.trim())} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </label>
        </div>
      </Section>
      <Section title="This device">
        <Row title="Where your pages are saved" desc="In data/workspace.json in the app folder, on this computer only. Page history is in data/history.">
          <span className="muted small">Local</span>
        </Row>
      </Section>
    </>
  )
}

function PreferencesPane() {
  const theme = useThemePref()
  const blocks = useStore((st) => st.blocks)
  const rootPages = useStore((st) => st.rootPages)
  const [start, setStart] = useState(() => localStorage.getItem(START_PAGE_KEY) ?? '')
  const [monday, setMonday] = useState(weekStartsMonday)
  const pages = rootPages.filter((id) => blocks[id]?.alive)
  return (
    <>
      <Section title="Appearance">
        <Row title="Theme" desc="Choose a theme for Notion(RE) on this device">
          <Dropdown<ThemePref>
            value={theme}
            onChange={setThemePref}
            options={[
              { value: 'system', label: 'Use system setting' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
      </Section>
      <Section title="Startup">
        <Row title="Open on start" desc="Choose what to show when the app opens">
          <Dropdown
            value={start}
            width={280}
            onChange={(v) => {
              setStart(v)
              localStorage.setItem(START_PAGE_KEY, v)
            }}
            options={[{ value: '', label: 'Last visited page' }, { value: 'home', label: 'Home' }, ...pages.map((id) => ({ value: id, label: `${blocks[id].format.icon ? blocks[id].format.icon + ' ' : ''}${pageTitle(blocks[id])}` }))]}
          />
        </Row>
      </Section>
      <Section title="Language & time">
        <Row title="Start week on Monday" desc="This will change how all calendars in your app look">
          <Switch
            on={monday}
            onChange={(v) => {
              setMonday(v)
              localStorage.setItem('notion-re:week-monday', v ? '1' : '0')
            }}
          />
        </Row>
      </Section>
    </>
  )
}

function AIPane() {
  const saved = useStore((s) => s.settings)
  const saveSettings = useStore((s) => s.saveSettings)
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; msg?: string }>({ state: 'idle' })
  const s = saved
  const p = s.provider
  const [cc, setCc] = useState<ClaudeStatus | null>(null)
  useEffect(() => {
    if (p === 'claude-code') claudeStatus(true).then(setCc)
  }, [p])
  // Saved as you change it, like Notion's settings.
  const update = (patch: Partial<AISettings>) => {
    saveSettings({ ...s, ...patch })
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
    <>
      <Section title="Provider">
        <Row title="AI provider" desc="Claude through your subscription can also read and edit your pages from the AI panel.">
          <Dropdown<AIProvider> value={p} width={300} onChange={(v) => update({ provider: v })} options={Object.entries(PROVIDERS).map(([k, v]) => ({ value: k as AIProvider, label: v.label }))} />
        </Row>
        {p === 'claude-code' ? (
          <div className={`claude-status ${cc ? (cc.available ? 'ok' : 'fail') : ''}`}>
            {!cc
              ? 'Checking for Claude Code…'
              : cc.available
                ? <>Connected to Claude Code {cc.version}. No API key needed.</>
                : <>Claude Code wasn't found. Install it and run <code>claude</code> once in a terminal to sign in.</>}
          </div>
        ) : (
          <Row title="API key" desc="Stored only in this app's browser storage.">
            <input
              className="input set-input"
              type="password"
              autoComplete="off"
              value={s.apiKeys[p] ?? ''}
              placeholder={PROVIDERS[p].keyHint}
              onChange={(e) => update({ apiKeys: { ...s.apiKeys, [p]: e.target.value.trim() } })}
            />
          </Row>
        )}
        {p === 'openai-compatible' && (
          <Row title="Base URL">
            <input className="input set-input" value={s.baseUrl} placeholder="http://localhost:11434/v1" onChange={(e) => update({ baseUrl: e.target.value })} />
          </Row>
        )}
        <Row title="Model" desc={p === 'claude-code' ? 'Leave empty for the default, or type sonnet, opus or haiku.' : undefined}>
          <input
            className="input set-input"
            value={s.models[p] ?? ''}
            placeholder={p === 'claude-code' ? 'Default' : PROVIDERS[p].defaultModel || 'Model name'}
            onChange={(e) => update({ models: { ...s.models, [p]: e.target.value.trim() } })}
          />
        </Row>
        {p === 'claude-code' && (
          <Row title="File access" desc="Let Claude read files on this computer (documents, PDFs, images, notes) and add them to your pages. It can't change or delete them.">
            <Dropdown<'off' | 'ask' | 'auto'>
              value={s.fileAccess ?? 'ask'}
              width={200}
              onChange={(v) => update({ fileAccess: v })}
              options={[
                { value: 'ask', label: 'Ask every time' },
                { value: 'auto', label: 'Automatic' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </Row>
        )}
        {p === 'claude-code' && (s.fileAccess ?? 'ask') !== 'off' && (
          <Row title="Folders" desc="One folder per line. Leave empty for your home folder and other drives.">
            <textarea
              className="input set-input set-folders"
              rows={3}
              value={s.folders ?? ''}
              placeholder={'C:\\Users\\you\nD:\\'}
              onChange={(e) => update({ folders: e.target.value })}
            />
          </Row>
        )}
        <Row title="Test connection" desc={test.state === 'idle' ? 'Sends a tiny test message.' : <span className={`test-${test.state}`}>{test.state === 'running' ? 'Testing…' : test.msg}</span>}>
          <button className="btn" onClick={runTest} disabled={test.state === 'running'}>Test</button>
        </Row>
      </Section>
    </>
  )
}

function ImportPane() {
  return (
    <Section title="Import">
      <Row title="Markdown" desc="Each .md file becomes a new page. The first # heading becomes its title.">
        <label className="btn">
          Choose files
          <input
            type="file"
            accept=".md,.markdown,.txt"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) importMarkdown(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </Row>
    </Section>
  )
}

function ShortcutsPane() {
  return (
    <Section title="Keyboard shortcuts">
      {SHORTCUTS.map(([a, k]) => (
        <div key={a} className="shortcut-row">
          <span>{a}</span>
          <kbd>{k}</kbd>
        </div>
      ))}
    </Section>
  )
}

const TABS: { id: SettingsTab; label: string; icon: IconName; title: string; sub?: string }[] = [
  { id: 'preferences', label: 'Preferences', icon: 'sliders', title: 'Preferences', sub: 'Choose how you want Notion(RE) to look and behave' },
  { id: 'ai', label: 'AI', icon: 'sparkle', title: 'AI', sub: 'Your own AI, used by the AI panel and inline AI' },
  { id: 'import', label: 'Import', icon: 'import', title: 'Import' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard', title: 'Keyboard shortcuts' },
]

export function SettingsModal({ onClose, tab: firstTab = 'preferences' }: { onClose: () => void; tab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(firstTab)
  const name = useProfileName()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.db-popover') && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const info = tab === 'account' ? { title: 'Account', sub: undefined } : TABS.find((t) => t.id === tab)!
  return (
    <div className="modal-backdrop settings-backdrop" onMouseDown={onClose}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="settings-nav-head">Account</div>
          <button className={`settings-nav-item ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>
            <span className="avatar">{initials(name)}</span>
            <span>{name || 'Your account'}</span>
          </button>
          <div className="settings-nav-head">Settings</div>
          {TABS.map((t) => (
            <button key={t.id} className={`settings-nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-body">
          <button className="settings-close ctl" title="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
          <div className="settings-content">
            <h1>{info.title}</h1>
            {info.sub && <p className="settings-sub">{info.sub}</p>}
            {tab === 'account' && <AccountPane />}
            {tab === 'preferences' && <PreferencesPane />}
            {tab === 'ai' && <AIPane />}
            {tab === 'import' && <ImportPane />}
            {tab === 'shortcuts' && <ShortcutsPane />}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const openPage = useStore((s) => s.openPage)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

const SHORTCUTS: [string, string][] = [["Search","Ctrl K / Ctrl P"],["Find in page","Ctrl F"],["New page","Ctrl N"],["AI panel","Ctrl J"],["Toggle sidebar","Ctrl \\"],["Settings","Ctrl ,"],["Dark / light mode","Ctrl Shift L"],["Back / forward","Ctrl [ / Ctrl ]"],["Copy page link","Ctrl L"],["Move page to…","Ctrl Shift P"],["Undo / redo","Ctrl Z / Ctrl Shift Z"],["Bold / italic / underline","Ctrl B / I / U"],["Strikethrough / code","Ctrl Shift S / Ctrl E"],["Highlight","Ctrl Shift H"],["Add link","Ctrl K (on selection)"],["Select block","Esc"],["Extend block selection","Shift ↑ / ↓ / click"],["Duplicate block","Ctrl D"],["Move block up / down","Ctrl Shift ↑ / ↓"],["Turn block into…","Ctrl Shift 0–9"],["Indent / outdent","Tab / Shift Tab"],["Open / close all toggles","Ctrl Alt T"],["Commands menu","/"],["Mention a page","@ or [["],["This list","Ctrl Alt /"]]

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      {SHORTCUTS.map(([a, k]) => (
        <div key={a} className="shortcut-row">
          <span>{a}</span>
          <kbd>{k}</kbd>
        </div>
      ))}
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
