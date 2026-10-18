// Floating toolbar over selected text (Notion's "richTextMenu"): Ask AI · Turn into · Link ·
// Bold · Italicize · Underline · Strike-through · Mark as code · Color · Clear format.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COLOR_NAMES } from '../../shared/blocks.ts'
import {
  activeSelection,
  clearFormatting,
  currentLink,
  normalizeUrl,
  recentColors,
  selectionMarks,
  setColor,
  setLink,
  toggle,
  type ActiveSelection,
  type SimpleMark,
} from '../formatting'
import { setSelectionOffsets } from '../richtext'
import { useStore } from '../store'
import type { BlockColor, BlockType } from '../types'
import { MENU_ITEMS } from './SlashMenu'

const MARKS: { mark: SimpleMark; label: string; title: string; style: React.CSSProperties }[] = [
  { mark: 'b', label: 'B', title: 'Bold (Ctrl+B)', style: { fontWeight: 700 } },
  { mark: 'i', label: 'i', title: 'Italicize (Ctrl+I)', style: { fontStyle: 'italic', fontFamily: 'Georgia, serif' } },
  { mark: 'u', label: 'U', title: 'Underline (Ctrl+U)', style: { textDecoration: 'underline' } },
  { mark: 's', label: 'S', title: 'Strike-through (Ctrl+Shift+S)', style: { textDecoration: 'line-through' } },
  { mark: 'code', label: '</>', title: 'Mark as code (Ctrl+E)', style: { fontSize: 12, fontFamily: 'var(--font-code)' } },
]

const TURN_INTO = MENU_ITEMS.filter((i) => i.key !== 'ai' && i.key !== 'page' && i.key !== 'database' && i.key !== 'divider')
const cap = (c: string) => c[0].toUpperCase() + c.slice(1)

type Panel = null | 'color' | 'turn' | 'link'

export function FormatToolbar() {
  const [sel, setSel] = useState<ActiveSelection | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [href, setHref] = useState('')
  const [, force] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  // While the link box has focus the page selection is gone; remember it.
  const saved = useRef<ActiveSelection | null>(null)
  const mouseDown = useRef(false)

  useEffect(() => {
    const update = () => {
      if (ref.current?.contains(document.activeElement)) return
      const s = activeSelection()
      setSel(s)
      if (!s) {
        setPanel(null)
        return
      }
      const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
      setRect(r)
    }
    const onChange = () => {
      // Don't pop up mid-drag; show when the mouse is released (like Notion).
      if (!mouseDown.current) update()
    }
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) mouseDown.current = true
    }
    const up = () => {
      if (!mouseDown.current) return
      mouseDown.current = false
      setTimeout(update, 0)
    }
    const onScroll = () => setSel((s) => (s ? (setRect(window.getSelection()!.getRangeAt(0).getBoundingClientRect()), s) : s))
    document.addEventListener('selectionchange', onChange)
    document.addEventListener('mousedown', down)
    document.addEventListener('mouseup', up)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      document.removeEventListener('mousedown', down)
      document.removeEventListener('mouseup', up)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  // Ctrl+K inside a block opens the link box (see Block.tsx).
  useEffect(() => {
    const open = () => {
      const s = activeSelection()
      if (!s) return
      setSel(s)
      setRect(window.getSelection()!.getRangeAt(0).getBoundingClientRect())
      openLink(s)
    }
    window.addEventListener('nre:link', open)
    return () => window.removeEventListener('nre:link', open)
  })

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!rect || !ref.current) return
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))
    const top = rect.top - h - 8 < 52 ? rect.bottom + 8 : rect.top - h - 8
    setPos({ left, top })
  }, [rect, sel, panel])

  if (!sel || !rect) return null
  const marks = selectionMarks(sel)
  const color = marks.find((m) => m.startsWith('c:'))?.slice(2)
  const blockType = useStore.getState().blocks[sel.blockId]?.type
  const after = () => force((n) => n + 1)
  const fresh = () => activeSelection() ?? saved.current ?? sel

  function openLink(s: ActiveSelection) {
    saved.current = s
    setHref(currentLink(s) ?? '')
    setPanel('link')
    setTimeout(() => linkInput.current?.focus(), 0)
  }
  const applyLink = (value: string | null) => {
    const s = saved.current
    if (!s) return
    setPanel(null)
    setSelectionOffsets(s.el, s.start, s.end)
    setLink(s, value)
    saved.current = null
  }

  const turnLabel = TURN_INTO.find((i) => i.key === blockType)?.label ?? 'Text'

  return (
    <div
      ref={ref}
      className="popover format-toolbar"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
      onMouseDown={(e) => {
        // Keep the text selection while clicking buttons (but let the link box take focus).
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
      }}
    >
      <div className="ft-row">
        <button
          className="ft-btn ft-ai"
          title="Ask AI to help edit, review, or generate text."
          onClick={() => {
            const s = fresh()
            const text = window.getSelection()?.toString() ?? ''
            s.el.closest('[data-block-id]')?.dispatchEvent(new CustomEvent('nre:ask-ai', { detail: { start: s.start, end: s.end, text } }))
            window.getSelection()?.removeAllRanges()
            setSel(null)
          }}
        >
          ✨ Ask AI
        </button>
        <span className="ft-sep" />
        <button className={`ft-btn ${panel === 'turn' ? 'on' : ''}`} title="Turn into" onClick={() => setPanel(panel === 'turn' ? null : 'turn')}>
          {turnLabel} <span className="ft-caret">▾</span>
        </button>
        <span className="ft-sep" />
        <button className={`ft-btn ${marks.some((m) => m.startsWith('a:')) ? 'active' : ''}`} title="Add link (Ctrl+K)" onClick={() => openLink(fresh())}>
          🔗 Link
        </button>
        <span className="ft-sep" />
        {MARKS.map((m) => (
          <button
            key={m.mark}
            className={`ft-btn ft-icon ${marks.includes(m.mark) ? 'active' : ''}`}
            title={m.title}
            style={m.style}
            onClick={() => {
              toggle(fresh(), m.mark)
              after()
            }}
          >
            {m.label}
          </button>
        ))}
        <span className="ft-sep" />
        <button className={`ft-btn ${panel === 'color' ? 'on' : ''}`} title="Text color" onClick={() => setPanel(panel === 'color' ? null : 'color')}>
          <span className="ft-a" data-color={color}>A</span>
          <span className="ft-caret">▾</span>
        </button>
        <button
          className="ft-btn ft-icon"
          title="Clear format (Ctrl+Alt+\)"
          onClick={() => {
            clearFormatting(fresh())
            after()
          }}
        >
          T<sub>x</sub>
        </button>
      </div>

      {panel === 'link' && (
        <form
          className="ft-panel ft-link"
          onSubmit={(e) => {
            e.preventDefault()
            const url = normalizeUrl(href)
            if (url) applyLink(url)
          }}
        >
          <input
            ref={linkInput}
            value={href}
            placeholder={saved.current && currentLink(saved.current) ? 'Edit link or search pages' : 'Paste link or search pages'}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                applyLinkCancel()
              }
            }}
          />
          {href && !normalizeUrl(href) && <div className="menu-hint ft-hint">Type a complete URL to link</div>}
          {saved.current && currentLink(saved.current) && (
            <button type="button" className="menu-item" onClick={() => applyLink(null)}>
              🗑 Remove link
            </button>
          )}
        </form>
      )}

      {panel === 'turn' && (
        <div className="ft-panel">
          <div className="menu-section">Turn into</div>
          {TURN_INTO.map((i) => (
            <button
              key={i.key}
              className={`menu-item compact ${i.key === blockType ? 'active' : ''}`}
              onClick={() => {
                const s = fresh()
                useStore.getState().setType(s.blockId, i.key as BlockType)
                setPanel(null)
                setTimeout(() => {
                  const el = document.querySelector<HTMLElement>(`[data-block-id="${s.blockId}"] .editable`)
                  if (el) setSelectionOffsets(el, s.start, s.end)
                }, 0)
              }}
            >
              <span className="menu-icon small">{i.icon}</span>
              {i.label}
              {i.key === blockType && <span className="ft-check">✓</span>}
            </button>
          ))}
        </div>
      )}

      {panel === 'color' && (
        <ColorPanel
          current={color}
          onPick={(c) => {
            setColor(fresh(), c)
            setPanel(null)
            after()
          }}
        />
      )}
    </div>
  )

  function applyLinkCancel() {
    const s = saved.current
    setPanel(null)
    saved.current = null
    if (s) setSelectionOffsets(s.el, s.start, s.end)
  }
}

export function ColorPanel({ current, onPick }: { current?: string; onPick: (c: BlockColor | 'default' | 'default_background') => void }) {
  const recent = recentColors()
  const swatch = (c: string) => {
    const bg = c.endsWith('_background')
    const name = bg ? c.replace('_background', '') : c
    return name === 'default' ? (
      <span className={`color-swatch ${bg ? 'sw-bg' : ''}`}>A</span>
    ) : (
      <span className="color-swatch" style={bg ? { background: `var(--bg-${name})` } : { color: `var(--c-${name})` }}>
        A
      </span>
    )
  }
  const item = (c: string, label: string) => (
    <button key={c} className={`menu-item compact ${current === c ? 'active' : ''}`} onClick={() => onPick(c as BlockColor)}>
      {swatch(c)} {label}
    </button>
  )
  return (
    <div className="ft-panel ft-colors">
      {recent.length > 0 && (
        <>
          <div className="menu-section">Recently used</div>
          <div className="ft-recent">
            {recent.map((c) => (
              <button key={c} title={c} onClick={() => onPick(c)}>
                {swatch(c)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="menu-section">Text color</div>
      {item('default', 'Default text')}
      {COLOR_NAMES.map((c) => item(c, `${cap(c)} text`))}
      <div className="menu-section">Background color</div>
      {item('default_background', 'Default background')}
      {COLOR_NAMES.map((c) => item(`${c}_background`, `${cap(c)} background`))}
    </div>
  )
}
