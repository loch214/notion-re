import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { activeModel, claudeStatus, PROVIDERS, streamChat, type ClaudeStatus } from '../ai'
import { htmlToText } from '../markdown'
import { pagePath, pageTitle, START_PAGE_KEY, useStore } from '../store'
import { setThemePref, useThemePref, type ThemePref } from '../theme'
import type { AIProvider, AISettings } from '../types'
import { Switch } from './DatePicker'
import { weekStartsMonday } from '../../shared/dates'
import { coverCss } from '../../shared/blocks.ts'
import { Avatar, photoFromFile, setProfile, useProfile, useProfileName } from '../profile'
import { Dropdown } from './Dropdown'
import { Icon, type IconName } from './Icons'
import { copyPageLink } from './PageMenu'
import { askAI } from '../askAI'
import { importMarkdown, setSidebarPrefs, useSidebarPrefs, type SidebarPrefs } from './Sidebar'
import { desktopNotifications, NOTIFY_KEY } from '../reminders'
import { ENTER_NEWLINE_KEY } from './AIPanel'
import { exportAllMarkdown, exportBackup, restoreBackup } from '../exportAll'

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

export type SettingsTab = 'account' | 'preferences' | 'notifications' | 'sidebar' | 'ai' | 'import' | 'shortcuts'

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
  const profile = useProfile()
  const [draft, setDraft] = useState(profile)
  const save = (patch: Partial<typeof profile>) => setProfile(patch)
  return (
    <>
      <Section title="My profile">
        <div className="set-profile">
          <div className="set-photo">
            <label className="set-photo-pick" title="Upload a photo">
              <Avatar className="large" />
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) save({ photo: await photoFromFile(f) })
                }}
              />
            </label>
            {profile.photo && <button className="btn small" onClick={() => save({ photo: '' })}>Remove photo</button>}
          </div>
          <label className="set-field">
            <span>Preferred name</span>
            <input className="input" value={draft.name} placeholder="Your name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={() => save({ name: draft.name.trim() })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </label>
        </div>
      </Section>
      <Section title="Account security">
        <Row title="Email" desc="Shown on your profile. There's no sign-in: Notion(RE) runs on this computer only.">
          <input className="input set-input" type="email" value={draft.email} placeholder="you@example.com" onChange={(e) => setDraft({ ...draft, email: e.target.value })} onBlur={() => save({ email: draft.email.trim() })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </Row>
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
  const [enterNewLine, setEnterNewLine] = useState(() => localStorage.getItem(ENTER_NEWLINE_KEY) === '1')
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
      <Section title="Input options">
        <Row title="Use Enter to add a new line" desc={<>Applies to the AI chat. Press <b>Ctrl</b> + <b>Enter</b> to send.</>}>
          <Switch
            on={enterNewLine}
            onChange={(v) => {
              setEnterNewLine(v)
              localStorage.setItem(ENTER_NEWLINE_KEY, v ? '1' : '0')
            }}
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

function NotificationsPane() {
  const [on, setOn] = useState(desktopNotifications)
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  const allow = () => 'Notification' in window && Notification.requestPermission().then(setPerm)
  return (
    <>
      <Section title="Reminders">
        <Row title="Desktop notifications" desc="Pop up a notification on this computer when a reminder is due. Reminders always land in your Inbox.">
          <Switch
            on={on}
            onChange={(v) => {
              setOn(v)
              localStorage.setItem(NOTIFY_KEY, v ? '1' : '0')
              if (v && perm === 'default') allow()
            }}
          />
        </Row>
        {on && perm !== 'granted' && (
          <Row title="Allow notifications" desc={perm === 'denied' ? 'Notifications are blocked for this app in the browser. Allow them in the site settings (the icon left of the address bar).' : 'The browser needs your permission once.'}>
            <button className="btn" disabled={perm === 'denied'} onClick={allow}>Allow</button>
          </Row>
        )}
        <Row title="Send a test notification" desc="Check that notifications reach you.">
          <button
            className="btn"
            disabled={perm !== 'granted'}
            onClick={() => new Notification('Notion(RE)', { body: 'Notifications are working.' })}
          >
            Test
          </button>
        </Row>
      </Section>
    </>
  )
}

function SidebarPane() {
  const prefs = useSidebarPrefs()
  const toggle = (k: keyof SidebarPrefs) => setSidebarPrefs({ ...prefs, [k]: !prefs[k] || undefined })
  return (
    <Section title="Sidebar">
      <Row title="Upcoming events" desc="Dated items from your databases in the next week.">
        <Switch on={!prefs.upcoming} onChange={() => toggle('upcoming')} />
      </Row>
      <Row title="Recents" desc="The pages you opened last.">
        <Switch on={!prefs.recent} onChange={() => toggle('recent')} />
      </Row>
      <Row title="Inbox" desc="Also list the Inbox under Home (it's always in the top bar of the sidebar).">
        <Switch on={!prefs.inbox} onChange={() => toggle('inbox')} />
      </Row>
    </Section>
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
          <Row title="File access" desc="Claude can read files in your home folder and on other drives (documents, PDFs, images, notes) and add them to your pages. It can't change or delete them, and never reads keys or passwords (.ssh, .aws, .env).">
            <Dropdown<'ask' | 'auto'>
              value={s.fileAccess === 'auto' ? 'auto' : 'ask'}
              width={200}
              onChange={(v) => update({ fileAccess: v })}
              options={[
                { value: 'ask', label: 'Ask every time' },
                { value: 'auto', label: 'Automatic' },
              ]}
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
  const [msg, setMsg] = useState('')
  return (
    <>
    <Section title="Export">
      <Row title="Export all pages" desc="Every page as a Markdown file in one .zip, in folders like your sidebar.">
        <button className="btn" onClick={() => setMsg(`Exported ${exportAllMarkdown()} pages.`)}>Export</button>
      </Row>
      <Row title="Back up workspace" desc="Everything (pages, databases, views, trash) in one file you can restore later.">
        <button className="btn" onClick={exportBackup}>Download backup</button>
      </Row>
      <Row title="Restore from backup" desc={msg || 'Puts back pages from a backup file. Nothing here is deleted; pages edited here since the backup are kept.'}>
        <label className="btn">
          Choose file
          <input
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                setMsg(`Restored ${await restoreBackup(f)} blocks. Undo with Ctrl+Z.`)
              } catch (err: any) {
                setMsg(err.message)
              }
            }}
          />
        </label>
      </Row>
    </Section>
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
    </>
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

/** Extra words that find a settings page in "Search settings". */
const SEARCH_WORDS: Partial<Record<SettingsTab, string>> = {
  preferences: 'theme dark light appearance enter new line startup open on start week monday language time',
  notifications: 'reminders desktop alerts inbox',
  sidebar: 'upcoming events recents inbox customize',
  ai: 'claude provider model api key file access files folders',
  import: 'markdown md files export backup restore zip download',
  shortcuts: 'keyboard keys hotkeys',
}

const TABS: { id: SettingsTab; label: string; icon: IconName; title: string; sub?: string }[] = [
  { id: 'preferences', label: 'Preferences', icon: 'sliders', title: 'Preferences', sub: 'Choose how you want Notion(RE) to look and behave' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', title: 'Notifications', sub: 'Reminders from dates and "Remind me" mentions' },
  { id: 'sidebar', label: 'Sidebar', icon: 'sidebar', title: 'Sidebar', sub: 'Choose what shows in your sidebar' },
  { id: 'ai', label: 'AI', icon: 'sparkle', title: 'AI', sub: 'Your own AI, used by the AI panel and inline AI' },
  { id: 'import', label: 'Import & export', icon: 'import', title: 'Import & export' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard', title: 'Keyboard shortcuts' },
]

export function SettingsModal({ onClose, tab: firstTab = 'preferences' }: { onClose: () => void; tab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(firstTab)
  const [find, setFind] = useState('')
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
          <label className="settings-search">
            <Icon name="search" size={14} />
            <input placeholder="Search settings" value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
          <div className="settings-nav-head">Account</div>
          <button className={`settings-nav-item ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>
            <Avatar />
            <span>{name || 'Your account'}</span>
          </button>
          <div className="settings-nav-head">Settings</div>
          {TABS.filter((t) => !find.trim() || `${t.label} ${t.sub ?? ''} ${SEARCH_WORDS[t.id] ?? ''}`.toLowerCase().includes(find.trim().toLowerCase())).map((t) => (
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
            {tab === 'notifications' && <NotificationsPane />}
            {tab === 'sidebar' && <SidebarPane />}
            {tab === 'ai' && <AIPane />}
            {tab === 'import' && <ImportPane />}
            {tab === 'shortcuts' && <ShortcutsPane />}
          </div>
        </div>
      </div>
    </div>
  )
}

const PREVIEW_KEY = 'notion-re:search-preview'

/** Notion's search preview: the highlighted page's cover, icon, title and first blocks. */
function SearchPreview({ id, onOpen }: { id: string; onOpen: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const page = blocks[id]
  if (!page) return null
  const lines = page.content
    .map((c) => blocks[c])
    .filter((b) => b?.alive)
    .slice(0, 14)
  return (
    <div className="search-preview">
      <div className="search-preview-tools">
        <button className="ctl" title="Copy link" onClick={() => copyPageLink(id)}><Icon name="link" size={14} /></button>
        <button className="ctl" title="Open" onClick={onOpen}><Icon name="openFull" size={14} /></button>
      </div>
      <div className="search-preview-cover" style={{ background: coverCss(page.format.cover) ?? undefined }} />
      <div className="search-preview-body">
        {page.format.icon && <div className="search-preview-icon">{page.format.icon}</div>}
        <div className={`search-preview-title ${pageTitle(page) ? '' : 'empty'}`}>{pageTitle(page) || 'Untitled'}</div>
        {page.schema && <div className="search-preview-line muted">Database · {page.content.filter((c) => blocks[c]?.alive).length} pages</div>}
        {!page.schema && lines.map((b) => {
          const text = b.type === 'page' ? pageTitle(b) : htmlToText(b.properties.title)
          if (!text && b.type !== 'divider') return null
          return (
            <div key={b.id} className={`search-preview-line t-${b.type}`}>
              {b.type === 'bulleted_list' && '• '}
              {b.type === 'to_do' && (b.properties.checked ? '☑ ' : '☐ ')}
              {b.type === 'page' && <Icon name="page" size={14} />}
              {text}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const openPage = useStore((s) => s.openPage)
  const rootPages = useStore((s) => s.rootPages)
  const name = useProfileName()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [titleOnly, setTitleOnly] = useState(false)
  const [inPage, setInPage] = useState('')
  const [sort, setSort] = useState<'edited' | 'oldest' | 'best'>('best')
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(() => localStorage.getItem(PREVIEW_KEY) !== 'off')
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
    const within = (id: string) => {
      if (!inPage) return true
      for (let b = blocks[id]; b; b = blocks[b.parent_id!]) if (b.id === inPage) return true
      return false
    }
    const seen = new Map<string, { snippet: string; title: boolean }>()
    for (const b of Object.values(blocks)) {
      if (!isAlive(b.id) || !within(b.id)) continue
      if ((!query || titleOnly) && b.type !== 'page') continue
      const text = b.type === 'page' ? b.properties.title : htmlToText(b.properties.title)
      if (query && !text.toLowerCase().includes(query)) continue
      const pid = pageOf(b.id)
      if (!pid) continue
      const old = seen.get(pid)
      if (!old || (b.type === 'page' && !old.title)) seen.set(pid, { snippet: b.type === 'page' ? old?.snippet ?? '' : text, title: b.type === 'page' || !!old?.title })
    }
    const list = [...seen.entries()].map(([id, r]) => ({ id, ...r }))
    const t = (id: string) => blocks[id].last_edited_time
    list.sort((a, b) => (sort === 'oldest' ? t(a.id) - t(b.id) : sort === 'best' && query ? +b.title - +a.title || t(b.id) - t(a.id) : t(b.id) - t(a.id)))
    return list.slice(0, 40)
  }, [q, blocks, titleOnly, inPage, sort])

  // Without a query, recent pages are grouped by when they were edited (Notion's Today / Yesterday / …).
  const groupOf = (ms: number) => {
    const day = 86_400_000
    const today = new Date().setHours(0, 0, 0, 0)
    return ms >= today ? 'Today' : ms >= today - day ? 'Yesterday' : ms >= today - 7 * day ? 'Past week' : ms >= today - 30 * day ? 'Past 30 days' : 'Older'
  }
  const query = q.trim()
  const askRow = query ? 1 : 0
  const total = results.length + askRow

  const go = (id: string) => {
    openPage(id)
    onClose()
  }
  const pick = (i: number) => {
    if (askRow && i === 0) {
      onClose()
      askAI(query)
    } else if (results[i - askRow]) go(results[i - askRow].id)
  }
  const mark = (text: string) => {
    const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
    if (i < 0) return text
    return (
      <>
        {text.slice(0, i)}
        <b>{text.slice(i, i + query.length)}</b>
        {text.slice(i + query.length)}
      </>
    )
  }

  let lastGroup = ''
  const current = results[active - askRow]?.id
  return (
    <div className="search-backdrop" onMouseDown={onClose}>
    <div className={`search-modal ${preview ? 'with-preview' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
      <div className="search-head">
        <Icon name="search" size={18} />
        <input
          ref={inputRef}
          className="search-input"
          placeholder={`Search or ask a question in ${name ? `${name}'s` : 'your'} Notion…`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, total - 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            else if (e.key === 'Enter') pick(active)
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && results[active - askRow]) {
              copyPageLink(results[active - askRow].id)
            } else return
            e.preventDefault()
          }}
        />
        <button
          className={`ctl search-preview-toggle ${preview ? 'on' : ''}`}
          title={preview ? 'Hide preview' : 'Show preview'}
          onClick={() => {
            localStorage.setItem(PREVIEW_KEY, preview ? 'off' : 'on')
            setPreview(!preview)
          }}
        >
          <Icon name="peek" size={18} />
        </button>
      </div>
      <div className="search-filters">
        <button className={`search-chip ${titleOnly ? 'on' : ''}`} onClick={() => setTitleOnly(!titleOnly)}>
          <span className="search-chip-aa">Aa</span> Title only
        </button>
        <Dropdown
          value={inPage}
          width={240}
          className={`search-chip ${inPage ? 'on' : ''}`}
          onChange={setInPage}
          options={[{ value: '', label: 'In: all pages' }, ...rootPages.filter((id) => blocks[id]?.alive).map((id) => ({ value: id, label: `In: ${pageTitle(blocks[id])}` }))]}
        />
        <Dropdown
          value={sort}
          width={200}
          className="search-chip"
          onChange={setSort}
          options={[
            { value: 'best', label: 'Sort: Best matches' },
            { value: 'edited', label: 'Sort: Last edited' },
            { value: 'oldest', label: 'Sort: Oldest first' },
          ]}
        />
      </div>
      <div className="search-main">
      <div className="search-results">
        {askRow > 0 && (
          <div className={`menu-item search-ask ${active === 0 ? 'active' : ''}`} onMouseEnter={() => setActive(0)} onClick={() => pick(0)}>
            <span className="search-row-icon"><Icon name="sparkle" size={18} /></span>
            <span className="menu-label">
              Ask AI: <b>{query}</b>
            </span>
          </div>
        )}
        {results.length === 0 && <div className="menu-empty">No results</div>}
        {results.map((r, i) => {
          const group = query ? 'Best matches' : groupOf(blocks[r.id].last_edited_time)
          const head = group !== lastGroup ? ((lastGroup = group), <div className="menu-section">{group}</div>) : null
          const path = pagePath(blocks, r.id).slice(0, -1).map((p) => pageTitle(p)).join(' / ')
          return (
            <div key={r.id}>
              {head}
              <div className={`menu-item search-row ${i + askRow === active ? 'active' : ''}`} onMouseEnter={() => setActive(i + askRow)} onClick={() => go(r.id)}>
                <span className="search-row-icon">{blocks[r.id].format.icon ?? <Icon name="page" size={18} />}</span>
                <span className="search-row-text">
                  <span className="menu-label">{mark(pageTitle(blocks[r.id]))}</span>
                  {path && <span className="search-row-path"> — {path}</span>}
                  {r.snippet && <div className="menu-hint">{mark(r.snippet.slice(0, 120))}</div>}
                </span>
                <span className="search-row-date">{new Date(blocks[r.id].last_edited_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          )
        })}
      </div>
      {preview && current && <SearchPreview id={current} onOpen={() => go(current)} />}
      </div>
      <div className="search-foot">
        <span><kbd>↑↓</kbd> Select</span>
        <span><kbd>↵</kbd> Open</span>
        <span><kbd>Ctrl+L</kbd> Copy link</span>
        <span><kbd>Esc</kbd> Close</span>
      </div>
    </div>
    </div>
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

/** Notion's Trash: a popup beside the sidebar with "Search pages in Trash", each page with where it was,
 * and Restore / Delete from Trash buttons on hover (delete asks once more, inline). */
export function TrashModal({ onClose }: { onClose: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const { restorePage, purgePage, openPage } = useStore.getState()
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const query = q.trim().toLowerCase()
  const trashed = Object.values(blocks)
    .filter((b) => b.type === 'page' && !b.alive && (!query || pageTitle(b).toLowerCase().includes(query)))
    .sort((a, b) => b.last_edited_time - a.last_edited_time)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    addEventListener('keydown', onKey)
    addEventListener('mousedown', onDown)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const side = document.querySelector('.sidebar-dock')?.getBoundingClientRect()
  return (
    <div ref={ref} className="popover trash-pop" style={{ left: side && side.width > 0 ? side.right + 4 : 12 }}>
      <div className="trash-search">
        <Icon name="search" size={16} />
        <input autoFocus placeholder="Search pages in Trash" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="trash-list">
        {trashed.length === 0 && <div className="trash-empty">{query ? 'No matches found.' : 'No pages in Trash'}</div>}
        {trashed.map((p) => {
          const where = pagePath(blocks, p.parent_id ?? '').map(pageTitle).join(' / ')
          return (
            <div key={p.id} className="trash-row" onMouseLeave={() => confirm === p.id && setConfirm(null)}>
              <span className="trash-icon">{p.format.icon ?? <Icon name="page" size={18} />}</span>
              <span className="trash-text" onClick={() => { openPage(p.id); onClose() }}>
                <span className="trash-title">{pageTitle(p)}</span>
                {where && <span className="trash-where">{where}</span>}
              </span>
              {confirm === p.id ? (
                <button className="btn small danger" onClick={() => { purgePage(p.id); setConfirm(null) }}>Delete forever</button>
              ) : (
                <>
                  <button className="ctl trash-btn" title="Restore" onClick={() => restorePage(p.id)}>
                    <Icon name="history" size={16} />
                  </button>
                  <button className="ctl trash-btn" title="Delete from Trash" onClick={() => setConfirm(p.id)}>
                    <Icon name="trash" size={16} />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
