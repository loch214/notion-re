import { useEffect, useState } from 'react'
import { AIPanel } from './components/AIPanel'
import { SearchModal, SettingsModal, ShortcutsModal, TrashModal } from './components/Modals'
import { HistoryModal } from './components/HistoryModal'
import { copyPageLink, MovePageModal, PageMenu, toggleFavorite } from './components/PageMenu'
import { PageView } from './components/PageView'
import { Sidebar } from './components/Sidebar'
import { FindBar } from './components/Find'
import { FormatToolbar } from './components/FormatToolbar'
import { pagePath, pageTitle, useStore } from './store'
import { toggleTheme } from './theme'

type ModalKind = 'search' | 'settings' | 'trash' | 'shortcuts' | null

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const currentPageId = useStore((s) => s.currentPageId)
  const blocks = useStore((s) => s.blocks)
  const [modal, setModal] = useState<ModalKind>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const announcement = useStore((s) => s.announcement)

  useEffect(() => {
    useStore.getState().load()
  }, [])

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
    document.title = page ? `${pageTitle(page)} · Notion(RE)` : 'Notion(RE)'
  }, [page?.properties.title])

  if (!loaded) return <div className="loading">Loading…</div>

  const path = page ? pagePath(blocks, page.id) : []

  return (
    <div className="app">
      {sidebarOpen && (
        <Sidebar
          onSearch={() => setModal('search')}
          onSettings={() => setModal('settings')}
          onTrash={() => setModal('trash')}
          onAI={() => setAiOpen(true)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button className="ctl" title="Toggle sidebar (Ctrl+\)" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div className="crumbs">
            {path.map((p, i) => (
              <span key={p.id}>
                {i > 0 && <span className="crumb-sep">/</span>}
                <button className="crumb" onClick={() => useStore.getState().openPage(p.id)}>
                  {p.format.icon && <span>{p.format.icon} </span>}
                  {pageTitle(p)}
                </button>
              </span>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          {page && !page.alive && <span className="trash-banner">This page is in the trash</span>}
          {page?.format.locked && (
            <button className="lock-pill" title={'Locked to prevent accidental editing.\nClick to unlock'} onClick={() => useStore.getState().updateBlock(page.id, { format: { locked: undefined } })}>
              🔒 Locked
            </button>
          )}
          {page && <span className="muted small">Edited {new Date(page.last_edited_time).toLocaleString()}</span>}
          <button className="btn-ghost" onClick={() => setAiOpen(!aiOpen)} title="AI assistant (Ctrl+J)">✨ AI</button>
          {page && (
            <button className={`btn-ghost fav-star ${page.format.favorite ? 'on' : ''}`} onClick={() => toggleFavorite(page.id)} title={page.format.favorite ? 'Remove from Favorites' : 'Add to Favorites'}>
              {page.format.favorite ? '★' : '☆'}
            </button>
          )}
          {page && <button className="btn-ghost" onClick={() => setPageMenuOpen(true)} title="Style, export, and more">⋯</button>}
        </header>
        <div className="scroll">
          {page ? (
            <PageView key={page.id} pageId={page.id} />
          ) : (
            <div className="no-page">
              <p>No page selected.</p>
              <button className="btn primary" onClick={() => useStore.getState().createPage(null)}>Create a page</button>
            </div>
          )}
        </div>
      </main>
      {findOpen && <FindBar onClose={() => setFindOpen(false)} />}
      {modal === 'shortcuts' && <ShortcutsModal onClose={() => setModal(null)} />}
      {aiOpen && <AIPanel onClose={() => setAiOpen(false)} onSettings={() => setModal('settings')} />}

      {pageMenuOpen && page && <PageMenu pageId={page.id} onClose={() => setPageMenuOpen(false)} onHistory={() => setHistoryOpen(true)} onMove={() => setMoveOpen(true)} />}
      {moveOpen && page && <MovePageModal pageId={page.id} onClose={() => setMoveOpen(false)} />}
      {historyOpen && page && <HistoryModal pageId={page.id} onClose={() => setHistoryOpen(false)} />}
      <Toast />
      <FormatToolbar />
      <div className="sr-only" aria-live="polite">{announcement}</div>
      {modal === 'search' && <SearchModal onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'trash' && <TrashModal onClose={() => setModal(null)} />}
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
