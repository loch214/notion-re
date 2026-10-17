import { useEffect, useRef, useState } from 'react'
import { activeModel, isConfigured, PROVIDERS, streamChat, type ChatMessage } from '../ai'
import { markdownToBlocks, pageToMarkdown } from '../markdown'
import { pageTitle, useStore } from '../store'
import { Markdown } from './Markdown'

const QUICK = ['Summarize this page', 'List the action items', 'Suggest improvements to this page', 'Explain this page simply']

export function AIPanel({ onClose, onSettings }: { onClose: () => void; onSettings: () => void }) {
  const settings = useStore((s) => s.settings)
  const pageId = useStore((s) => s.currentPageId)
  const page = useStore((s) => (pageId ? s.blocks[pageId] : undefined))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages])
  useEffect(() => () => abort.current?.abort(), [])

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    setInput('')
    setError('')
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setBusy(true)
    abort.current = new AbortController()

    const context = pageId ? pageToMarkdown(useStore.getState().blocks, pageId) : ''
    // The page is attached to the latest question so answers reflect current edits.
    const withContext = history.map((m, i) =>
      i === history.length - 1 && context ? { ...m, content: `Current page:\n<page>\n${context}\n</page>\n\n${m.content}` } : m,
    )
    try {
      await streamChat(settings, withContext, (chunk) =>
        setMessages((ms) => {
          const copy = [...ms]
          copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + chunk }
          return copy
        }),
        abort.current.signal,
      )
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message ?? String(e))
        setMessages((ms) => (ms.at(-1)?.content ? ms : ms.slice(0, -1)))
      }
    } finally {
      setBusy(false)
    }
  }

  const insertIntoPage = (text: string) => {
    if (!pageId) return
    const { insertBlock, updateBlock, requestFocus } = useStore.getState()
    let last = ''
    for (const spec of markdownToBlocks(text)) {
      last = insertBlock({ parent: pageId, type: spec.type, title: spec.title })
      if (spec.checked) updateBlock(last, { properties: { checked: true } })
    }
    if (last) requestFocus({ id: last, at: 'end' })
  }

  return (
    <aside className="ai-panel">
      <div className="ai-panel-head">
        <span>✨ AI assistant</span>
        <span className="muted small">{isConfigured(settings) ? `${PROVIDERS[settings.provider].label.split(' ')[0]} · ${activeModel(settings)}` : ''}</span>
        <span style={{ flex: 1 }} />
        {messages.length > 0 && <button className="ctl" title="New chat" onClick={() => setMessages([])}>⟲</button>}
        <button className="ctl" onClick={onClose} title="Close">✕</button>
      </div>

      {!isConfigured(settings) ? (
        <div className="ai-empty">
          <p>Connect your own AI provider to start.</p>
          <button className="btn primary" onClick={onSettings}>Open settings</button>
        </div>
      ) : (
        <>
          <div className="ai-messages">
            {messages.length === 0 && (
              <div className="ai-empty">
                <p className="muted">Ask anything about <b>{pageTitle(page)}</b>.</p>
                {QUICK.map((q) => (
                  <button key={q} className="menu-item" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === 'assistant' ? (
                  <>
                    {m.content ? <Markdown text={m.content} /> : <span className="pulse">✨ Thinking…</span>}
                    {m.content && !(busy && i === messages.length - 1) && (
                      <div className="msg-actions">
                        <button className="btn small" onClick={() => insertIntoPage(m.content)}>Insert into page</button>
                        <button className="btn small" onClick={() => navigator.clipboard.writeText(m.content)}>Copy</button>
                      </div>
                    )}
                  </>
                ) : (
                  m.content
                )}
              </div>
            ))}
            {error && <div className="ai-error">{error}</div>}
            <div ref={endRef} />
          </div>
          <form
            className="ai-compose"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
          >
            <textarea
              value={input}
              rows={2}
              placeholder="Ask AI…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>Stop</button>
            ) : (
              <button className="btn primary" disabled={!input.trim()}>Send</button>
            )}
          </form>
        </>
      )}
    </aside>
  )
}
