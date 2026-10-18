import { useEffect, useRef, useState } from 'react'
import { isConfigured, streamChat } from '../ai'
import { inlineMarkdownToHtml, markdownToBlocks, pageToMarkdown } from '../markdown'
import { parse, render, replaceText, type Seg } from '../richtext'
import { useStore } from '../store'
import { Markdown } from './Markdown'

interface Props {
  blockId: string
  pageId: string
  onClose: () => void
  /** Text the user selected (from the formatting toolbar's "Ask AI"); the answer can replace it. */
  selection?: { start: number; end: number; text: string }
}

const SUGGESTIONS = ['Continue writing', 'Summarize this page', 'Brainstorm ideas about…', 'Make a to-do list for…', 'Draft an outline for…']
// Notion's "Edit with AI" choices for selected text.
const EDIT_SUGGESTIONS = ['Improve writing', 'Fix spelling & grammar', 'Make shorter', 'Make longer', 'Simplify language', 'Translate to…', 'Explain this']

export function AIInline({ blockId, pageId, onClose, selection }: Props) {
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
        [
          {
            role: 'user',
            content: selection
              ? `Here is the current page:\n\n<page>\n${context}\n</page>\n\nSelected text:\n<selection>\n${selection.text}\n</selection>\n\nTask: ${text}\nReply with only the new text for the selection (inline Markdown allowed), no preamble.`
              : `Here is the current page:\n\n<page>\n${context}\n</page>\n\nTask: ${text}`,
          },
        ],
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

  // Put the answer in place of the selected text (keeps the block, its type and colour).
  const replaceSelection = () => {
    if (!selection) return
    const el = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"] .editable`)
    if (!el) return
    const inserted = parse(inlineMarkdownToHtml(output.trim().replace(/\s*\n+\s*/g, ' ')))
    const segs = replaceText(parse(el.innerHTML), selection.start, selection.end, '\u0000')
    // Swap the placeholder character for the new segments.
    const out: Seg[] = []
    for (const sg of segs) {
      const i = sg.text.indexOf('\u0000')
      if (i < 0) out.push(sg)
      else out.push({ text: sg.text.slice(0, i), marks: sg.marks }, ...inserted, { text: sg.text.slice(i + 1), marks: sg.marks })
    }
    el.innerHTML = render(out.filter((x) => x.text))
    el.dispatchEvent(new Event('input', { bubbles: true }))
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
          {selection && <button className="btn primary" onClick={replaceSelection}>Replace selection</button>}
          <button className={`btn ${selection ? '' : 'primary'}`} onClick={insert}>{selection ? 'Insert below' : 'Insert'}</button>
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
              placeholder={selection ? 'Edit with AI' : 'Ask AI to write anything…'}
            />
            <button className="btn primary" disabled={!prompt.trim()}>Go</button>
          </form>
          {!prompt && (
            <div className="ai-suggestions">
              {(selection ? EDIT_SUGGESTIONS : SUGGESTIONS).map((s) => (
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
