import { useEffect, useState } from 'react'
import { AIPanel } from './components/AIPanel'
import { SearchModal, SettingsModal, TrashModal } from './components/Modals'
import { PageMenu } from './components/PageMenu'
import { PageView } from './components/PageView'
import { Sidebar } from './components/Sidebar'
import { pagePath, pageTitle, useStore } from './store'

type ModalKind = 'search' | 'settings' | 'trash' | null

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const currentPageId = useStore((s) => s.currentPageId)
  const blocks = useStore((s) => s.blocks)
  const [modal, setModal] = useState<ModalKind>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pageMenuOpen, setPageMenuOpen] = useState(false)

  useEffect(() => {
    useStore.getState().load()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setModal('search')
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setAiOpen((o) => !o)
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        setSidebarOpen((o) => !o)
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
          {page && <span className="muted small">Edited {new Date(page.last_edited_time).toLocaleString()}</span>}
          <button className="btn-ghost" onClick={() => setAiOpen(!aiOpen)} title="AI assistant (Ctrl+J)">✨ AI</button>
          {page && <button className="btn-ghost" onClick={() => setPageMenuOpen(true)} title="Page style">⋯</button>}
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
      {aiOpen && <AIPanel onClose={() => setAiOpen(false)} onSettings={() => setModal('settings')} />}

      {pageMenuOpen && page && <PageMenu pageId={page.id} onClose={() => setPageMenuOpen(false)} />}
      {modal === 'search' && <SearchModal onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'trash' && <TrashModal onClose={() => setModal(null)} />}
    </div>
  )
}
