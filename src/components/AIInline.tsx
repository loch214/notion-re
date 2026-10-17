import { useEffect, useRef, useState } from 'react'
import { isConfigured, streamChat } from '../ai'
import { markdownToBlocks, pageToMarkdown } from '../markdown'
import { useStore } from '../store'
import { Markdown } from './Markdown'

interface Props {
  blockId: string
  pageId: string
  onClose: () => void
}

const SUGGESTIONS = ['Continue writing', 'Summarize this page', 'Brainstorm ideas about…', 'Make a to-do list for…', 'Draft an outline for…']

export function AIInline({ blockId, pageId, onClose }: Props) {
  const settings = useStore((s) => s.settings)
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastPrompt = useRef('')

  useEffect(() => {
    inputRef.current?.focus()
    return () => abort.current?.abort()
  }, [])

  const run = async (text: string) => {
    if (!text.trim()) return
    lastPrompt.current = text
    setOutput('')
    setError('')
    setStatus('streaming')
    abort.current = new AbortController()
    const { blocks } = useStore.getState()
    const context = pageToMarkdown(blocks, pageId)
    try {
      await streamChat(
        settings,
        [{ role: 'user', content: `Here is the current page:\n\n<page>\n${context}\n</page>\n\nTask: ${text}` }],
        (chunk) => setOutput((o) => o + chunk),
        abort.current.signal,
      )
      setStatus('done')
    } catch (e: any) {
      if (e.name === 'AbortError') return setStatus('done')
      setError(e.message ?? String(e))
      setStatus('error')
    }
  }

  const insert = () => {
    const { blocks, insertBlock, updateBlock, removeBlock, requestFocus } = useStore.getState()
    const specs = markdownToBlocks(output)
    let after = blockId
    for (const spec of specs) {
      after = insertBlock({ after, type: spec.type, title: spec.title })
      if (spec.checked) updateBlock(after, { properties: { checked: true } })
    }
    // Replace the empty line the AI was invoked from.
    const origin = blocks[blockId]
    if (origin && !origin.properties.title && origin.content.length === 0 && specs.length) removeBlock(blockId)
    requestFocus({ id: after, at: 'end' })
    onClose()
  }

  if (!isConfigured(settings)) {
    return (
      <div className="ai-inline">
        <div className="ai-note">
          ✨ Add an API key in <b>Settings</b> (bottom of the sidebar) to use AI.
          <button className="btn-link" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-inline" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {output && <div className="ai-output"><Markdown text={output} /></div>}
      {error && <div className="ai-error">{error}</div>}
      {status === 'streaming' ? (
        <div className="ai-bar">
          <span className="ai-spark pulse">✨</span>
          <span className="muted">AI is writing…</span>
          <button className="btn" onClick={() => abort.current?.abort()}>Stop</button>
        </div>
      ) : status === 'done' && output ? (
        <div className="ai-bar">
          <button className="btn primary" onClick={insert}>Insert</button>
          <button className="btn" onClick={() => run(lastPrompt.current)}>Try again</button>
          <button className="btn" onClick={onClose}>Discard</button>
        </div>
      ) : (
        <>
          <form
            className="ai-bar"
            onSubmit={(e) => {
              e.preventDefault()
              run(prompt)
            }}
          >
            <span className="ai-spark">✨</span>
            <input
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask AI to write anything…"
            />
            <button className="btn primary" disabled={!prompt.trim()}>Go</button>
          </form>
          {!prompt && (
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="menu-item"
                  onClick={() => (s.endsWith('…') ? (setPrompt(s.slice(0, -1) + ' '), inputRef.current?.focus()) : run(s))}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
