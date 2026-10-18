import { useEffect, useRef, useState } from 'react'
import { activeModel, claudeChat, isConfigured, PROVIDERS, streamChat, type ChatMessage } from '../ai'
import { markdownToBlocks, pageToMarkdown } from '../markdown'
import { hasNamedStep, pageTitle, useStore } from '../store'
import { Icon, type IconName } from './Icons'
import { Markdown } from './Markdown'

const QUICK: [IconName, string][] = [['list', 'Summarize this page'], ['translate', 'Translate this page'], ['search', 'Analyze for insights'], ['checkCircle', 'List the action items']]
const AGENT_QUICK: [IconName, string][] = [['list', 'Summarize this page'], ['translate', 'Translate this page'], ['search', 'Analyze for insights'], ['checkCircle', 'Create a task tracker']]

type PanelMessage = ChatMessage & {
  tools?: string[]
  /** Name of the undo step holding every change Claude made in this reply. */
  undoName?: string
  undoResult?: { restored: number; skipped: number }
}

/** Changes reach the app over the live-sync channel shortly after a tool runs; keep listening a bit. */
const CHECKPOINT_GRACE_MS = 2000

export function AIPanel({ onClose, onSettings }: { onClose: () => void; onSettings: () => void }) {
  const settings = useStore((s) => s.settings)
  const pageId = useStore((s) => s.currentPageId)
  const page = useStore((s) => (pageId ? s.blocks[pageId] : undefined))
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef<string | undefined>(undefined)
  const agent = settings.provider === 'claude-code'
  useStore((s) => s.historyTick) // re-render when undo steps change

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])
  useEffect(() => () => abort.current?.abort(), [])

  const updateLast = (fn: (m: PanelMessage) => PanelMessage) =>
    setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])])

  const newChat = () => {
    setMessages([])
    sessionId.current = undefined
  }

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    setInput('')
    setError('')
    const history: PanelMessage[] = [...messages, { role: 'user', content: text }]
    // Like Notion AI's per-turn undo: everything Claude changes in this reply is one named undo step.
    const undoName = agent ? `ai-turn-${Date.now()}` : undefined
    setMessages([...history, { role: 'assistant', content: '', undoName }])
    setBusy(true)
    abort.current = new AbortController()

    if (agent && undoName) {
      useStore.getState().beginCheckpoint(undoName)
      // Your own Claude, with tools to read and edit the workspace directly.
      try {
        sessionId.current = await claudeChat(
          {
            message: text,
            mode: 'agent',
            sessionId: sessionId.current,
            pageId: pageId ?? undefined,
            pageTitle: page?.properties.title,
            model: settings.models['claude-code'] || undefined,
          },
          {
            onText: (t) => updateLast((m) => ({ ...m, content: m.content + t })),
            onTurn: () => updateLast((m) => (m.content && !m.content.endsWith('\n\n') ? { ...m, content: m.content + '\n\n' } : m)),
            onTool: (_name, label) => updateLast((m) => ({ ...m, tools: [...(m.tools ?? []), label] })),
          },
          abort.current.signal,
        )
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setError(e.message ?? String(e))
          setMessages((ms) => (ms.at(-1)?.content || ms.at(-1)?.tools ? ms : ms.slice(0, -1)))
        }
      } finally {
        setBusy(false)
        setTimeout(() => useStore.getState().endCheckpoint(undoName), CHECKPOINT_GRACE_MS)
      }
      return
    }

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
    const { insertBlock, updateBlock, requestFocus, transact } = useStore.getState()
    let last = ''
    transact(() => {
      for (const spec of markdownToBlocks(text)) {
        last = insertBlock({ parent: pageId, type: spec.type, title: spec.title })
        if (spec.checked) updateBlock(last, { properties: { checked: true } })
      }
    })
    if (last) requestFocus({ id: last, at: 'end' })
  }

  return (
    <aside className="ai-panel">
      <div className="ai-panel-head">
        <span className="ai-avatar small"><Icon name="sparkle" size={14} /></span>
        <span className="ai-title">{messages.length ? messages[0].content.slice(0, 40) : 'New AI chat'}</span>
        <span style={{ flex: 1 }} />
        <button className="ctl top-ctl" title="New chat" onClick={newChat}>
          <Icon name="compose" />
        </button>
        <button className="ctl top-ctl" onClick={onClose} title="Close (Ctrl+J)">
          <Icon name="expand" />
        </button>
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
              <div className="ai-welcome">
                <span className="ai-avatar"><Icon name="sparkle" size={30} /></span>
                <h2>How can I help you today?</h2>
                {(agent ? AGENT_QUICK : QUICK).map(([icon, q]) => (
                  <button key={q} className="ai-suggestion" onClick={() => send(q)}>
                    <Icon name={icon} size={18} />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === 'assistant' ? (
                  <>
                    {m.tools?.map((t, j) => (
                      <div key={j} className={`tool-step ${busy && i === messages.length - 1 && j === m.tools!.length - 1 && !m.content ? 'pulse' : ''}`}>
                        ⚙️ {t}…
                      </div>
                    ))}
                    {m.content ? <Markdown text={m.content} /> : !m.tools?.length && <span className="pulse">✨ Thinking…</span>}
                    {m.undoName && !(busy && i === messages.length - 1) && <TurnUndo message={m} onDone={(r) => setMessages((ms) => ms.map((x) => (x === m ? { ...x, undoResult: r } : x)))} />}
                    {m.content && !agent && !(busy && i === messages.length - 1) && (
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
              placeholder={agent ? `Ask Claude, or ask it to edit ${pageTitle(page)}…` : 'Ask AI…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
            />
            <div className="ai-compose-bar">
              <span className="ai-model">{agent ? settings.models['claude-code'] || 'Claude' : activeModel(settings)}</span>
              <span style={{ flex: 1 }} />
              {busy ? (
                <button type="button" className="ai-send stop" title="Stop" onClick={() => abort.current?.abort()}>
                  <span className="stop-square" />
                </button>
              ) : (
                <button className="ai-send" title="Send (Enter)" disabled={!input.trim()}>
                  <Icon name="arrowUp" size={16} />
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </aside>
  )
}

/** "Undo changes" under a Claude reply that edited the workspace. */
function TurnUndo({ message, onDone }: { message: PanelMessage; onDone: (r: { restored: number; skipped: number }) => void }) {
  const r = message.undoResult
  if (r) {
    return (
      <div className="ai-undo">
        ↶ Changes undone{r.skipped ? ` · ${r.skipped} block${r.skipped > 1 ? 's' : ''} you edited afterwards ${r.skipped > 1 ? 'were' : 'was'} kept` : ''}
      </div>
    )
  }
  if (!hasNamedStep(message.undoName!)) return null
  return (
    <div className="ai-undo">
      <button
        className="btn small"
        title="Put back everything Claude changed in this reply"
        onClick={() => {
          const res = useStore.getState().undoNamed(message.undoName!)
          if (res) onDone(res)
        }}
      >
        ↶ Undo changes
      </button>
    </div>
  )
}
