// Formatting the selected text inside one editable block — shared by the selection toolbar
// and the keyboard shortcuts (Ctrl+B/I/U/E, Ctrl+Shift+S/X/H, Ctrl+Alt+\, Ctrl+K).

import type { BlockColor } from './types'
import { applyToEditable, clearMarks, getSelectionOffsets, marksIn, parse, setMark, toggleMark, type Mark } from './richtext'

export type SimpleMark = 'b' | 'i' | 'u' | 's' | 'code'

export interface ActiveSelection {
  el: HTMLElement
  blockId: string
  start: number
  end: number
}

/** The non-empty selection inside a single rich-text block (not code blocks), if any. */
export function activeSelection(): ActiveSelection | null {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null
  const node = sel.getRangeAt(0).commonAncestorContainer
  const el = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest<HTMLElement>('.editable')
  // Not in code blocks, and not on a locked page (its blocks aren't editable).
  if (!el || !el.isContentEditable || el.closest('.code-wrap') || el.closest('[data-plain]')) return null
  const blockId = el.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
  const off = getSelectionOffsets(el)
  if (!blockId || !off || off.start === off.end) return null
  return { el, blockId, ...off }
}

export function selectionMarks(s: ActiveSelection): Mark[] {
  return marksIn(parse(s.el.innerHTML), s.start, s.end)
}

export function toggle(s: ActiveSelection, mark: SimpleMark) {
  applyToEditable(s.el, (segs) => toggleMark(segs, s.start, s.end, mark), s)
}

const LAST_COLOR = 'notion-re:last-color'

/** Colours picked from the colour menu, newest first (Notion's "Recently used"). */
export function recentColors(): BlockColor[] {
  try {
    return JSON.parse(localStorage.getItem(LAST_COLOR) ?? '[]')
  } catch {
    return []
  }
}

/** `default` removes text colour, `default_background` removes the highlight. */
export function setColor(s: ActiveSelection, color: BlockColor | 'default' | 'default_background') {
  const isBg = color.endsWith('_background')
  applyToEditable(
    s.el,
    (segs) => {
      // One colour value per character (Notion's "h" annotation): text colour and highlight replace each other.
      if (color === 'default' || color === 'default_background') {
        const current = marksIn(segs, s.start, s.end).find((m) => m.startsWith('c:'))
        if (current && current.endsWith('_background') !== isBg) return segs
        return setMark(segs, s.start, s.end, 'c:', false)
      }
      return setMark(segs, s.start, s.end, 'c:' + color, true)
    },
    s,
  )
  if (color !== 'default' && color !== 'default_background') {
    localStorage.setItem(LAST_COLOR, JSON.stringify([color, ...recentColors().filter((c) => c !== color)].slice(0, 5)))
  }
}

/** Ctrl+Shift+H: apply the last used colour (yellow highlight the first time) — or remove it. */
export function toggleHighlight(s: ActiveSelection) {
  const color = recentColors()[0] ?? 'yellow_background'
  const has = selectionMarks(s).includes('c:' + color)
  setColor(s, has ? (color.endsWith('_background') ? 'default_background' : 'default') : color)
}

export function clearFormatting(s: ActiveSelection) {
  applyToEditable(s.el, (segs) => clearMarks(segs, s.start, s.end), s)
}

/** Normalise what the user typed into a link: bare domains get https://. Returns null if unusable. */
export function normalizeUrl(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  if (/^(https?:|mailto:)/i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t
  return null
}

export function setLink(s: ActiveSelection, href: string | null) {
  applyToEditable(s.el, (segs) => setMark(segs, s.start, s.end, href ? 'a:' + href : 'a:', !!href), s)
}

export function currentLink(s: ActiveSelection): string | null {
  return selectionMarks(s).find((m) => m.startsWith('a:'))?.slice(2) ?? null
}
