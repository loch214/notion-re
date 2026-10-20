import { useEffect, useRef, useState } from 'react'
import { activeModel, answerPermission, claudeChat, isConfigured, PROVIDERS, streamChat, type ChatMessage, type PermissionRequest } from '../ai'
import { markdownToBlocks, pageToMarkdown } from '../markdown'
import { ASK_AI_EVENT, takePendingPrompt } from '../askAI'
import { hasNamedStep, isServerMode, pageTitle, useStore } from '../store'
import { Icon, type IconName } from './Icons'
import { Markdown } from './Markdown'
import { ActionMenu } from './Menu'

const QUICK: [IconName, string][] = [['list', 'Summarize this page'], ['translate', 'Translate this page'], ['search', 'Analyze for insights'], ['checkCircle', 'List the action items']]
const AGENT_QUICK: [IconName, string][] = [['list', 'Summarize this page'], ['translate', 'Translate this page'], ['search', 'Analyze for insights'], ['checkCircle', 'Create a task tracker']]

/** A file attached in the composer, uploaded to data/files. */
interface Attachment {
  name: string
  /** /api/files/… once uploaded */
  url?: string
  image: boolean
  error?: string
}

type PanelMessage = ChatMessage & {
  tools?: string[]
  /** File accesses Claude asked to make ("Ask every time"), with the user's answer. */
  asks?: (PermissionRequest & { answer?: 'allow' | 'always' | 'deny' })[]
  /** Pages attached as context to this question (shown as chips). */
  pages?: string[]
  /** Files attached to this question (thumbnails / chips). */
  files?: Attachment[]
  /** Name of the undo step holding every change Claude made in this reply. */
  undoName?: string
  undoResult?: { restored: number; skipped: number }
}

interface ChatSummary {
  id: string
  title: string
  updated: number
}

/** Changes reach the app over the live-sync channel shortly after a tool runs; keep listening a bit. */
const CHECKPOINT_GRACE_MS = 2000
const OPEN_CHAT_KEY = 'notion-re:ai-chat'
export const ENTER_NEWLINE_KEY = 'notion-re:enter-newline'
/** File types the composer accepts (the server's upload list). */
const ATTACH_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'md', 'csv', 'json', 'docx', 'xlsx', 'pptx']
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp']

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16)
const chatTitle = (ms: PanelMessage[]) => ms.find((m) => m.role === 'user')?.content.trim().split('\n')[0].slice(0, 80) || 'New chat'

async function uploadAttachment(file: File): Promise<string> {
  const ext = file.type === 'image/png' && !file.name.includes('.') ? 'png' : (file.name.split('.').pop() ?? '').toLowerCase()
  const r = await fetch('/api/files', { method: 'POST', headers: { 'x-file-ext': ext }, body: file })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Upload failed')
  return (await r.json()).url
}

export function AIPanel({ onClose, onSettings }: { onClose: () => void; onSettings: () => void }) {
  const settings = useStore((s) => s.settings)
  const pageId = useStore((s) => s.currentPageId)
  const page = useStore((s) => (pageId ? s.blocks[pageId] : undefined))
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Extra pages given to Claude as context (Notion AI's "@" / Add context); kept for the whole chat.
  const [attached, setAttached] = useState<string[]>([])
  const [files, setFiles] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [picker, setPicker] = useState<{ fromAt: boolean } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chatId, setChatId] = useState(() => localStorage.getItem(OPEN_CHAT_KEY) ?? newId())
  const abort = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const sessionId = useRef<string | undefined>(undefined)
  const agent = settings.provider === 'claude-code'
  // Chats are saved on the local server (data/chats), so history needs it running.
  const canSave = isServerMode()
  useStore((s) => s.historyTick) // re-render when undo steps change

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])
  useEffect(() => () => abort.current?.abort(), [])

  // Reopen the chat that was open last time.
  useEffect(() => {
    const id = localStorage.getItem(OPEN_CHAT_KEY)
    if (id && canSave) openChat(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Save the chat after each reply (and after approvals / undo), like Notion AI's chat history.
  useEffect(() => {
    if (busy || !canSave || !messages.length) return
    localStorage.setItem(OPEN_CHAT_KEY, chatId)
    fetch(`/api/chats/${chatId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: chatTitle(messages), sessionId: sessionId.current, messages }),
    }).catch(() => {})
  }, [messages, busy, chatId, canSave])

  // Prompts sent from menus ("Use with AI" → Summarize…); an empty one just focuses the composer.
  const sendRef = useRef<(t: string) => void>(() => {})
  const newChatRef = useRef<() => void>(() => {})
  useEffect(() => {
    const take = () => {
      const p = takePendingPrompt()
      if (!p) return
      if (p.fresh) newChatRef.current()
      if (p.prompt) setTimeout(() => sendRef.current(p.prompt), 50)
      else setTimeout(() => document.querySelector<HTMLTextAreaElement>('.ai-compose textarea')?.focus(), 50)
    }
    take()
    window.addEventListener(ASK_AI_EVENT, take)
    return () => window.removeEventListener(ASK_AI_EVENT, take)
  }, [])

  const updateLast = (fn: (m: PanelMessage) => PanelMessage) =>
    setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])])

  // Bumped by New chat so a slow "reopen last chat" doesn't overwrite it.
  const generation = useRef(0)
  const newChat = () => {
    generation.current++
    abort.current?.abort()
    setMessages([])
    setAttached([])
    setFiles([])
    setError('')
    setChatId(newId())
    localStorage.removeItem(OPEN_CHAT_KEY)
    sessionId.current = undefined
  }

  async function openChat(id: string) {
    const gen = ++generation.current
    const r = await fetch(`/api/chats/${id}`).catch(() => null)
    if (gen !== generation.current) return
    if (!r?.ok) return localStorage.removeItem(OPEN_CHAT_KEY)
    const c = await r.json()
    abort.current?.abort()
    setChatId(c.id)
    setMessages(c.messages ?? [])
    sessionId.current = c.sessionId
    setAttached([])
    setFiles([])
    setError('')
    localStorage.setItem(OPEN_CHAT_KEY, c.id)
  }

  const addFiles = (list: Iterable<File>) => {
    for (const f of list) {
      const ext = f.type === 'image/png' && !f.name.includes('.') ? 'png' : (f.name.split('.').pop() ?? '').toLowerCase()
      const name = f.name || `Pasted image.${ext}`
      if (!ATTACH_EXT.includes(ext)) {
        setError(`Can't attach ${name}: use an image, PDF, text, Word, Excel or PowerPoint file.`)
        continue
      }
      const item: Attachment = { name, image: IMAGE_EXT.includes(ext) }
      setFiles((fs) => [...fs, item])
      uploadAttachment(f)
        .then((url) => setFiles((fs) => fs.map((x) => (x === item ? { ...x, url } : x))))
        .catch((e) => setFiles((fs) => fs.map((x) => (x === item ? { ...x, error: e.message } : x))))
    }
  }

  const send = async (text: string) => {
    if (!text.trim() || busy || files.some((f) => !f.url && !f.error)) return
    setInput('')
    setError('')
    const blocks = useStore.getState().blocks
    const pages = attached.filter((id) => blocks[id]?.alive && id !== pageId)
    const sentFiles = files.filter((f) => f.url)
    setFiles([])
    const history: PanelMessage[] = [...messages, { role: 'user', content: text, pages: pages.length ? pages : undefined, files: sentFiles.length ? sentFiles : undefined }]
    // Like Notion AI's per-turn undo: everything Claude changes in this reply is one named undo step.
    const undoName = agent ? `ai-turn-${Date.now()}` : undefined
    setMessages([...history, { role: 'assistant', content: '', undoName }])
    setBusy(true)
    abort.current = new AbortController()

    if (agent && undoName) {
      useStore.getState().beginCheckpoint(undoName)
      // Your own Claude, with tools to read and edit the workspace directly.
      try {
        const names = sentFiles.map((f) => `"${f.name}"`).join(', ')
        let message = text
        if (pages.length) message += `\n\n(Attached pages for context — read them with read_page: ${pages.map((id) => `"${pageTitle(blocks[id])}" (id: ${id})`).join(', ')})`
        if (names) message += `\n\n(I attached: ${names})`
        sessionId.current = await claudeChat(
          {
            message,
            mode: 'agent',
            sessionId: sessionId.current,
            pageId: pageId ?? undefined,
            pageTitle: page?.properties.title,
            model: settings.models['claude-code'] || undefined,
            fileAccess: settings.fileAccess === 'auto' ? 'auto' : 'ask',
            attachments: sentFiles.map((f) => f.url!.split('/').pop()!),
          },
          {
            onText: (t) => updateLast((m) => ({ ...m, content: m.content + t })),
            onTurn: () => updateLast((m) => (m.content && !m.content.endsWith('\n\n') ? { ...m, content: m.content + '\n\n' } : m)),
            onTool: (_name, label) => updateLast((m) => ({ ...m, tools: [...(m.tools ?? []), label] })),
            onPermission: (req) => updateLast((m) => ({ ...m, asks: [...(m.asks ?? []), req] })),
            onSession: (id) => (sessionId.current = id),
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

    const context = [
      ...(pageId ? [`Current page:\n<page>\n${pageToMarkdown(blocks, pageId)}\n</page>`] : []),
      ...pages.map((id) => `Attached page "${pageTitle(blocks[id])}":\n<page>\n${pageToMarkdown(blocks, id)}\n</page>`),
    ].join('\n\n')
    // The pages are attached to the latest question so answers reflect current edits.
    const withContext = history.map(({ role, content }, i) =>
      i === history.length - 1 && context ? { role, content: `${context}\n\n${content}` } : { role, content },
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

  sendRef.current = send
  newChatRef.current = newChat

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

  const canAttach = agent && canSave
  return (
    <aside
      className={`ai-panel ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        if (!canAttach || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        if (!canAttach || !e.dataTransfer.files.length) return
        e.preventDefault()
        setDragging(false)
        addFiles(e.dataTransfer.files)
      }}
    >
      <div className="ai-panel-head">
        <button className="ai-title-btn" title="Past chats" onClick={() => canSave && setHistoryOpen(!historyOpen)}>
          <span className="ai-title">{messages.length ? chatTitle(messages) : 'New AI chat'}</span>
          {canSave && <Icon name="down" size={12} />}
        </button>
        <span style={{ flex: 1 }} />
        <button className="ctl top-ctl" title="New chat" onClick={newChat}>
          <Icon name="compose" />
        </button>
        <button className="ctl top-ctl" onClick={onClose} title="Close (Ctrl+J)">
          <Icon name="expand" />
        </button>
        {historyOpen && <ChatHistory current={chatId} onOpen={(id) => { setHistoryOpen(false); if (id !== chatId) openChat(id) }} onDeleted={(id) => id === chatId && newChat()} onClose={() => setHistoryOpen(false)} />}
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
                    {m.asks?.map((a) => (
                      <AskCard key={a.id} ask={a} stale={!(busy && i === messages.length - 1)} onAnswer={(answer) => setMessages((ms) => ms.map((x) => (x === m ? { ...x, asks: x.asks!.map((y) => (y.id === a.id ? { ...y, answer } : y)) } : x)))} />
                    ))}
                    {m.content ? <Markdown text={m.content} /> : !m.tools?.length && busy && i === messages.length - 1 && <span className="pulse">✨ Thinking…</span>}
                    {m.undoName && !(busy && i === messages.length - 1) && <TurnUndo message={m} onDone={(r) => setMessages((ms) => ms.map((x) => (x === m ? { ...x, undoResult: r } : x)))} />}
                    {m.content && !agent && !(busy && i === messages.length - 1) && (
                      <div className="msg-actions">
                        <button className="btn small" onClick={() => insertIntoPage(m.content)}>Insert into page</button>
                        <button className="btn small" onClick={() => navigator.clipboard.writeText(m.content)}>Copy</button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {(m.pages || m.files) && (
                      <div className="ai-chips">
                        {m.pages?.map((id) => <PageChip key={id} id={id} />)}
                        {m.files?.map((f, j) => <FileChip key={j} file={f} />)}
                      </div>
                    )}
                    {m.content}
                  </>
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
            <div className="ai-chips">
              <button type="button" className="ai-chip ai-add-context" title="Add pages as context (or type @)" onClick={() => setPicker(picker ? null : { fromAt: false })}>
                @
              </button>
              {page && <PageChip id={page.id} current />}
              {attached.filter((id) => id !== pageId).map((id) => (
                <PageChip key={id} id={id} onRemove={() => setAttached(attached.filter((x) => x !== id))} />
              ))}
              {files.map((f, j) => (
                <FileChip key={j} file={f} onRemove={() => setFiles(files.filter((x) => x !== f))} />
              ))}
            </div>
            {picker && (
              <PagePicker
                exclude={[...attached, ...(pageId ? [pageId] : [])]}
                onPick={(id) => {
                  setAttached([...attached, id])
                  if (picker.fromAt) setInput((v) => v.replace(/@$/, ''))
                  setPicker(null)
                }}
                onClose={() => setPicker(null)}
              />
            )}
            <textarea
              value={input}
              rows={2}
              placeholder={agent ? `Ask Claude, or ask it to edit ${pageTitle(page)}…` : 'Ask AI…'}
              onChange={(e) => {
                const v = e.target.value
                if (v.length === input.length + 1 && /(^|\s)@$/.test(v)) setPicker({ fromAt: true })
                setInput(v)
              }}
              onPaste={(e) => {
                const pasted = [...e.clipboardData.files]
                if (!canAttach || !pasted.length) return
                e.preventDefault()
                addFiles(pasted)
              }}
              onKeyDown={(e) => {
                // Settings → Preferences → "Use Enter to add a new line": then Ctrl+Enter sends.
                const enterNewLine = localStorage.getItem(ENTER_NEWLINE_KEY) === '1'
                if (e.key === 'Enter' && !e.shiftKey && (enterNewLine ? e.ctrlKey || e.metaKey : true)) {
                  e.preventDefault()
                  send(input)
                }
              }}
            />
            <div className="ai-compose-bar">
              {canAttach && (
                <>
                  <button type="button" className="ctl ai-attach" title="Attach files or images" onClick={() => fileInput.current?.click()}>
                    <Icon name="attach" size={16} />
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    hidden
                    accept={ATTACH_EXT.map((x) => '.' + x).join(',')}
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </>
              )}
              {agent ? <ModelPicker /> : <span className="ai-model">{activeModel(settings)}</span>}
              <span style={{ flex: 1 }} />
              {busy ? (
                <button type="button" className="ai-send stop" title="Stop" onClick={() => abort.current?.abort()}>
                  <span className="stop-square" />
                </button>
              ) : (
                <button className="ai-send" title="Send (Enter)" disabled={!input.trim() || files.some((f) => !f.url && !f.error)}>
                  <Icon name="arrowUp" size={16} />
                </button>
              )}
            </div>
          </form>
          {dragging && <div className="ai-drop">Drop files to attach</div>}
        </>
      )}
    </aside>
  )
}

// Notion's composer model picker ("Auto ▾"). Auto lets Claude Code pick its default model.
const CLAUDE_MODELS: [string, string, string][] = [
  ['', 'Auto', 'Uses your Claude Code default'],
  ['opus', 'Claude Opus', 'Most capable, for complex work'],
  ['sonnet', 'Claude Sonnet', 'Fast and capable'],
  ['haiku', 'Claude Haiku', 'Fastest, for quick tasks'],
]

function ModelPicker() {
  const settings = useStore((s) => s.settings)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const current = settings.models['claude-code'] ?? ''
  const label = CLAUDE_MODELS.find(([id]) => id === current)?.[1] ?? current
  return (
    <>
      <button type="button" className="ai-model-btn" title="Choose a model" onClick={(e) => setRect(rect ? null : e.currentTarget.getBoundingClientRect())}>
        {label}
        <Icon name="down" size={12} />
      </button>
      {rect && (
        <ActionMenu
          className="ai-model-menu"
          search={false}
          style={{ left: rect.left, bottom: innerHeight - rect.top + 6, width: 220 }}
          onClose={() => setRect(null)}
          entries={CLAUDE_MODELS.map(([id, name, hint]) => ({
            label: name,
            title: hint,
            active: id === current,
            onClick: () => useStore.getState().saveSettings({ ...settings, models: { ...settings.models, 'claude-code': id } }),
          }))}
        />
      )}
    </>
  )
}

/** Past chats (Notion AI's chat history): open, rename or delete, grouped by when they were last used. */
function ChatHistory({ current, onOpen, onDeleted, onClose }: { current: string; onOpen: (id: string) => void; onDeleted: (id: string) => void; onClose: () => void }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const load = () => fetch('/api/chats').then((r) => r.json()).then(setChats).catch(() => setChats([]))
  useEffect(() => {
    load()
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    setTimeout(() => document.addEventListener('mousedown', down))
    return () => document.removeEventListener('mousedown', down)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const day = 86_400_000
  const today = new Date().setHours(0, 0, 0, 0)
  const groups: [string, ChatSummary[]][] = [['Today', []], ['Past 7 days', []], ['Past 30 days', []], ['Older', []]]
  for (const c of chats ?? []) {
    if (q && !c.title.toLowerCase().includes(q.trim().toLowerCase())) continue
    groups[c.updated >= today ? 0 : c.updated >= today - 7 * day ? 1 : c.updated >= today - 30 * day ? 2 : 3][1].push(c)
  }
  const rename = async (id: string, title: string) => {
    setEditing(null)
    await fetch(`/api/chats/${id}/rename`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) })
    load()
  }
  return (
    <div className="ai-history" ref={ref}>
      <input autoFocus className="ai-picker-search" placeholder="Search chats…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} />
      {chats && !chats.length && <div className="menu-section">No chats yet</div>}
      {groups.map(([label, list]) =>
        list.length ? (
          <div key={label}>
            <div className="menu-section">{label}</div>
            {list.map((c) => (
              <div key={c.id} className={`menu-item compact ai-history-item ${c.id === current ? 'active' : ''}`} onClick={() => editing !== c.id && onOpen(c.id)}>
                <Icon name="chat" size={16} />
                {editing === c.id ? (
                  <input
                    autoFocus
                    className="ai-history-rename"
                    defaultValue={c.title}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => rename(c.id, e.target.value.trim())}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <span className="ai-history-title">{c.title}</span>
                )}
                <button
                  className="ctl ai-history-act"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(c.id)
                  }}
                >
                  <Icon name="pencil" size={14} />
                </button>
                <button
                  className="ctl ai-history-act"
                  title="Delete"
                  onClick={async (e) => {
                    e.stopPropagation()
                    await fetch(`/api/chats/${c.id}`, { method: 'DELETE' })
                    onDeleted(c.id)
                    load()
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : null,
      )}
    </div>
  )
}

/** An attached file: a thumbnail for pictures, a named chip for documents. */
function FileChip({ file, onRemove }: { file: Attachment; onRemove?: () => void }) {
  const state = file.error ? 'error' : file.url ? '' : 'uploading'
  return (
    <span className={`ai-chip ai-file ${file.image && file.url ? 'thumb' : ''} ${state}`} title={file.error ?? file.name}>
      {file.image && file.url ? <img src={file.url} alt="" /> : <Icon name={file.image ? 'page' : 'attach'} size={12} />}
      {!(file.image && file.url) && <span className="ai-chip-name">{state === 'uploading' ? 'Uploading…' : file.name}</span>}
      {onRemove && (
        <button type="button" className="ai-chip-x" title="Remove" onClick={onRemove}>
          ×
        </button>
      )}
    </span>
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

/** A page shown as a chip in the composer / on a question. */
function PageChip({ id, current, onRemove }: { id: string; current?: boolean; onRemove?: () => void }) {
  const b = useStore((s) => s.blocks[id])
  if (!b?.alive) return null
  return (
    <span className="ai-chip" title={current ? 'Current page (always included)' : pageTitle(b)}>
      <span className="ai-chip-icon">{b.format.icon ?? '📄'}</span>
      <span className="ai-chip-name">{pageTitle(b)}</span>
      {onRemove && (
        <button type="button" className="ai-chip-x" title="Remove" onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  )
}

/** Search box listing pages to attach, most recently edited first. */
function PagePicker({ exclude, onPick, onClose }: { exclude: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const query = q.trim().toLowerCase()
  const matches = Object.values(blocks)
    .filter((b) => b.alive && b.type === 'page' && !exclude.includes(b.id) && pageTitle(b).toLowerCase().includes(query))
    .sort((a, b) => b.last_edited_time - a.last_edited_time)
    .slice(0, 8)
  return (
    <div className="ai-picker">
      <input
        autoFocus
        className="ai-picker-search"
        placeholder="Search for a page…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setSel(0)
        }}
        onBlur={() => setTimeout(onClose, 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          else if (e.key === 'ArrowDown') setSel((sel + 1) % Math.max(1, matches.length))
          else if (e.key === 'ArrowUp') setSel((sel - 1 + matches.length) % Math.max(1, matches.length))
          else if (e.key === 'Enter') {
            e.preventDefault()
            if (matches[sel]) onPick(matches[sel].id)
          } else return
          e.stopPropagation()
        }}
      />
      {matches.map((b, i) => (
        <div key={b.id} className={`menu-item compact ${i === sel ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(b.id)}>
          <span className="ai-chip-icon">{b.format.icon ?? '📄'}</span> {pageTitle(b)}
        </div>
      ))}
      {!matches.length && <div className="menu-section">No pages found</div>}
    </div>
  )
}

/** "Claude wants to read a file" — Allow once / Allow for this chat / Deny. */
function AskCard({ ask, stale, onAnswer }: { ask: NonNullable<PanelMessage['asks']>[number]; stale: boolean; onAnswer: (a: 'allow' | 'always' | 'deny') => void }) {
  const answer = (a: 'allow' | 'always' | 'deny') => {
    onAnswer(a)
    answerPermission(ask.id, a !== 'deny', a === 'always')
  }
  return (
    <div className={`ai-ask ${ask.answer || stale ? 'answered' : ''}`}>
      <div className="ai-ask-title">
        <Icon name="page" size={14} /> {ask.answer ? ask.label : `Claude wants to: ${ask.label.toLowerCase()}`}
      </div>
      {ask.detail && <div className="ai-ask-detail" title={ask.detail}>{ask.detail}</div>}
      {stale && !ask.answer ? (
        <div className="ai-ask-result">Not answered</div>
      ) : ask.answer ? (
        <div className="ai-ask-result">{ask.answer === 'deny' ? 'Denied' : ask.answer === 'always' ? 'Allowed for this chat' : 'Allowed'}</div>
      ) : (
        <div className="ai-ask-actions">
          <button className="btn small primary" onClick={() => answer('allow')}>Allow</button>
          <button className="btn small" onClick={() => answer('always')}>Allow for this chat</button>
          <button className="btn small" onClick={() => answer('deny')}>Deny</button>
        </div>
      )}
    </div>
  )
}
