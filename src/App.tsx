import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { AIPanel, getAIMode, setAIMode, type AIMode } from './components/AIPanel'
import { ASK_AI_EVENT, askAI } from './askAI'
import type { SettingsTab } from './components/Modals'
import { SearchModal, SettingsModal, ShortcutsModal, TrashModal } from './components/Modals'
import { HistoryModal } from './components/HistoryModal'
import { copyPageLink, MovePageModal, PageMenu, toggleFavorite } from './components/PageMenu'
import { PageView } from './components/PageView'
import { Sidebar } from './components/Sidebar'
import { FindBar } from './components/Find'
import { Icon } from './components/Icons'
import { FormatToolbar } from './components/FormatToolbar'
import { HOME_ID, LIBRARY_ID, pagePath, pageTitle, useStore } from './store'
import { Library } from './components/Library'
import { Home } from './components/Home'
import { InboxPanel } from './components/Inbox'
import { TemplatesModal } from './components/Templates'
import { PeekPanel } from './components/Peek'
import { useReminderTicker } from './reminders'
import { toggleTheme } from './theme'

type ModalKind = 'search' | 'settings' | 'trash' | 'shortcuts' | 'templates' | null

/** "just now", "5 minutes ago", "3 hours ago", "Oct 18" — like Notion's "Edited …". */
function timeAgo(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minute${m > 1 ? 's' : ''} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const currentPageId = useStore((s) => s.currentPageId)
  const blocks = useStore((s) => s.blocks)
  const [modal, setModal] = useState<ModalKind>(null)
  const [aiOpen, setAiOpen] = useState(false)
  // The panel stays mounted after the first open so it can slide out (and keeps a running chat alive).
  const [aiMounted, setAiMounted] = useState(false)
  const [aiMode, setAiModeState] = useState<AIMode>(getAIMode)
  // Sidebar "New chat" opens the chat full screen, like Notion's chat page, without changing the saved mode.
  const [aiFull, setAiFull] = useState(false)
  const [sideRight, setSideRight] = useState(0)
  // "open" is applied a frame after mounting so the first open slides in too.
  const [aiShown, setAiShown] = useState(false)
  useEffect(() => {
    if (aiOpen) setAiMounted(true)
    else setAiFull(false)
    if (!aiOpen) return setAiShown(false)
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setAiShown(true))))
    return () => cancelAnimationFrame(id)
  }, [aiOpen])
  useEffect(() => {
    const open = () => setAiOpen(true)
    window.addEventListener(ASK_AI_EVENT, open)
    return () => window.removeEventListener(ASK_AI_EVENT, open)
  }, [])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>()
  const announcement = useStore((s) => s.announcement)
  const [inboxLeft, setInboxLeft] = useState<number | null>(null)
  const openInbox = useCallback(() => setInboxLeft(document.querySelector('.sidebar-dock')?.getBoundingClientRect().right ?? 0), [])
  useReminderTicker(openInbox)

  useEffect(() => {
    useStore.getState().load()
  }, [])

  useEffect(() => {
    const side = document.querySelector('.sidebar-dock')
    if (!side) return setSideRight(0)
    const ro = new ResizeObserver(() => setSideRight(side.getBoundingClientRect().right))
    ro.observe(side)
    return () => ro.disconnect()
  }, [sidebarOpen, loaded])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (e.defaultPrevented) return
      if (mod && !e.shiftKey && !e.altKey && key === 'f') {
        e.preventDefault()
        setFindOpen(true)
        return
      }
      if (mod && e.altKey && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault()
        setModal('shortcuts')
        return
      }
      // Undo / redo for the workspace. Text boxes (AI prompt, database cells) keep their own.
      const inTextBox = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (mod && !e.altKey && !inTextBox && (key === 'z' || key === 'y')) {
        e.preventDefault()
        if (key === 'y' || e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo()
        return
      }
      const S = useStore.getState()
      // Notion: Ctrl+K adds a link to selected text (handled in the block) or opens search; Ctrl+P searches.
      if (mod && !e.shiftKey && !e.altKey && (key === 'k' || key === 'p')) {
        e.preventDefault()
        setModal('search')
      } else if (mod && !e.altKey && (key === 'j' || key === ';')) {
        e.preventDefault()
        setAiOpen((o) => !o)
      } else if (mod && !e.shiftKey && !e.altKey && e.key === '\\') {
        e.preventDefault()
        setSidebarOpen((o) => !o)
      } else if (mod && e.shiftKey && !e.altKey && key === 'l') {
        e.preventDefault()
        toggleTheme()
      } else if (mod && !e.shiftKey && !e.altKey && key === 'n') {
        // Ctrl+N is "new window" in the browser; the desktop app lets us take it.
        e.preventDefault()
        S.createPage(null)
      } else if (mod && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault()
        setModal('settings')
      } else if (mod && e.altKey && key === 't' && S.currentPageId) {
        e.preventDefault()
        S.toggleAll(S.currentPageId)
      } else if (mod && e.shiftKey && !e.altKey && key === 'u' && S.currentPageId) {
        e.preventDefault()
        const parent = pagePath(S.blocks, S.currentPageId).at(-2)
        if (parent) S.openPage(parent.id)
      } else if (mod && !e.shiftKey && !e.altKey && (e.key === '[' || e.key === ']')) {
        // Back / forward through the pages you visited.
        e.preventDefault()
        if (e.key === '[') history.back()
        else history.forward()
      } else if (mod && !e.shiftKey && !e.altKey && key === 'l' && S.currentPageId) {
        e.preventDefault()
        copyPageLink(S.currentPageId)
      } else if (mod && e.shiftKey && !e.altKey && key === 'p' && S.currentPageId) {
        e.preventDefault()
        setMoveOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const page = currentPageId ? blocks[currentPageId] : undefined
  useEffect(() => {
    document.title = page ? `${pageTitle(page)} · Notion(RE)` : currentPageId === HOME_ID ? 'Home · Notion(RE)' : currentPageId === LIBRARY_ID ? 'Library · Notion(RE)' : 'Notion(RE)'
  }, [page?.properties.title, currentPageId])

  if (!loaded) return <div className="loading">Loading…</div>

  const path = page ? pagePath(blocks, page.id) : []

  return (
    <div className="app">
      {(
        <Sidebar
          open={sidebarOpen}
          onSearch={() => setModal('search')}
          onSettings={(tab) => {
            setSettingsTab(tab)
            setModal('settings')
          }}
          onTrash={() => setModal('trash')}
          onTemplates={() => setModal('templates')}
          onAI={() => {
            setAiFull(true)
            askAI('', true)
          }}
          onShortcuts={() => setModal('shortcuts')}
          onInbox={() => (inboxLeft === null ? openInbox() : setInboxLeft(null))}
          onCollapse={() => setSidebarOpen(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          {!sidebarOpen && (
            <button className="ctl top-ctl" title="Open sidebar (Ctrl+\\)" onClick={() => setSidebarOpen(true)}>
              <Icon name="expand" />
            </button>
          )}
          <button className="ctl top-ctl" title="Go back (Ctrl+[)" onClick={() => history.back()}>
            <Icon name="left" />
          </button>
          <button className="ctl top-ctl" title="Go forward (Ctrl+])" onClick={() => history.forward()}>
            <Icon name="right" />
          </button>
          <div className="crumbs">
            {currentPageId === HOME_ID && (
              <span className="crumb-wrap">
                <span className="crumb"><Icon name="home" size={16} /> Home</span>
              </span>
            )}
            {currentPageId === LIBRARY_ID && (
              <span className="crumb-wrap">
                <span className="crumb"><Icon name="library" size={16} /> Library</span>
              </span>
            )}
            {path.map((p, i) => (
              <span key={p.id} className="crumb-wrap">
                {i > 0 && <span className="crumb-sep">/</span>}
                <button className="crumb" onClick={() => useStore.getState().openPage(p.id)}>
                  {p.format.icon && <span className="crumb-icon">{p.format.icon}</span>}
                  {pageTitle(p)}
                </button>
              </span>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          {page?.format.locked && (
            <button className="lock-pill" title={'Locked to prevent accidental editing.\nClick to unlock'} onClick={() => useStore.getState().updateBlock(page.id, { format: { locked: undefined } })}>
              <Icon name="lock" size={14} /> Locked
            </button>
          )}
          {page && <span className="top-edited" title={new Date(page.last_edited_time).toLocaleString()}>Edited {timeAgo(page.last_edited_time)}</span>}
          {page && (
            <button className="ctl top-ctl" title="Copy link (Ctrl+L)" onClick={() => copyPageLink(page.id)}>
              <Icon name="link" />
            </button>
          )}
          {page && (
            <button className={`ctl top-ctl fav-star ${page.format.favorite ? 'on' : ''}`} onClick={() => toggleFavorite(page.id)} title={page.format.favorite ? 'Remove from Favorites' : 'Add to Favorites'}>
              <Icon name="star" />
            </button>
          )}
          {page && (
            <button className="ctl top-ctl" onClick={() => setPageMenuOpen(true)} title="Style, export, and more">
              <Icon name="more" />
            </button>
          )}
        </header>
        <div className="scroll">
          {currentPageId === HOME_ID ? (
            <Home />
          ) : currentPageId === LIBRARY_ID ? (
            <Library />
          ) : page ? (
            <PageView key={page.id} pageId={page.id} />
          ) : (
            <div className="no-page">
              <p>No page selected.</p>
              <button className="btn primary" onClick={() => useStore.getState().createPage(null)}>Create a page</button>
            </div>
          )}
        </div>
        {/* Notion's round AI button in the bottom-right corner opens the AI panel. */}
        {!aiOpen && (
          <button className="ai-fab" title="AI chat (Ctrl+J)" onClick={() => setAiOpen(true)}>
            <Icon name="sparkle" size={22} />
          </button>
        )}
      </main>
      {inboxLeft !== null && <InboxPanel left={inboxLeft} onClose={() => setInboxLeft(null)} />}
      <PeekPanel />
      {findOpen && <FindBar onClose={() => setFindOpen(false)} />}
      {modal === 'shortcuts' && <ShortcutsModal onClose={() => setModal(null)} />}
      {aiMounted && (
        <div className={`ai-dock ${aiFull ? 'full' : aiMode} ${aiShown ? 'open' : ''}`} style={{ '--ai-full-left': `${sideRight}px` } as React.CSSProperties}>
          <AIPanel
            open={aiOpen}
            mode={aiFull ? 'full' : aiMode}
            onMode={(m) => {
              setAiFull(false)
              setAIMode(m)
              setAiModeState(m)
            }}
            onClose={() => setAiOpen(false)}
            onSettings={() => setModal('settings')}
          />
        </div>
      )}

      {pageMenuOpen && page && <PageMenu pageId={page.id} onClose={() => setPageMenuOpen(false)} onHistory={() => setHistoryOpen(true)} onMove={() => setMoveOpen(true)} />}
      {moveOpen && page && <MovePageModal pageId={page.id} onClose={() => setMoveOpen(false)} />}
      {historyOpen && page && <HistoryModal pageId={page.id} onClose={() => setHistoryOpen(false)} />}
      <Toast />
      <FormatToolbar />
      <div className="sr-only" aria-live="polite">{announcement}</div>
      {modal === 'search' && <SearchModal onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsModal tab={settingsTab} onClose={() => setModal(null)} />}
      {modal === 'trash' && <TrashModal onClose={() => setModal(null)} />}
      {modal === 'templates' && <TemplatesModal onClose={() => setModal(null)} />}
    </div>
  )
}

/** Bottom toast with an optional action (e.g. "Moved to trash · Undo"); hides after 10 s like Notion's. */
function Toast() {
  const toast = useStore((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useStore.getState().showToast(null), 10_000)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.label}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action!.run()
            useStore.getState().showToast(null)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="ctl" title="Dismiss" onClick={() => useStore.getState().showToast(null)}>✕</button>
    </div>
  )
}
