// Rich text as a list of segments, each with a set of marks — the same shape Notion uses for
// `properties.title` ([["text", [["b"], ["h", "red"]]], …]). We store sanitized HTML, so this
// module converts HTML ⇄ segments, edits marks on a character range, and maps the DOM
// selection to character offsets (a <br> counts as one "\n" character).

import { BLOCK_COLORS } from '../shared/blocks.ts'
import { escapeHtml } from './markdown'

/** b · i · u · s · code · a:<href> · c:<color> (text colour `red` or highlight `red_background`) */
export type Mark = string
export interface Seg {
  text: string
  marks: Mark[]
}

const SIMPLE = ['b', 'i', 'u', 's', 'code'] as const
// Rendering order, outermost first (matches how Notion nests: link, colour, then styles).
const ORDER = (m: Mark) => (m.startsWith('a:') ? 0 : m.startsWith('c:') ? 1 : 2 + SIMPLE.indexOf(m as (typeof SIMPLE)[number]))

const TAG_MARK: Record<string, Mark> = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', CODE: 'code' }

export function parse(html: string): Seg[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const out: Seg[] = []
  const walk = (node: Node, marks: Mark[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) out.push({ text: node.textContent, marks })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    if (el.tagName === 'BR') return void out.push({ text: '\n', marks })
    let next = marks
    const m = TAG_MARK[el.tagName]
    if (m) next = withMark(marks, m)
    else if (el.tagName === 'A' && el.getAttribute('href')) next = withMark(marks, 'a:' + el.getAttribute('href'))
    else if (el.tagName === 'SPAN' && isColor(el.getAttribute('data-color'))) next = withMark(marks, 'c:' + el.getAttribute('data-color'))
    el.childNodes.forEach((c) => walk(c, next))
  }
  doc.body.firstChild!.childNodes.forEach((c) => walk(c, []))
  return normalize(out)
}

const isColor = (c: string | null): c is string => !!c && (BLOCK_COLORS as string[]).includes(c)

function withMark(marks: Mark[], m: Mark): Mark[] {
  // Only one link and one colour at a time.
  const kind = m.startsWith('a:') ? 'a:' : m.startsWith('c:') ? 'c:' : null
  const rest = kind ? marks.filter((x) => !x.startsWith(kind)) : marks.filter((x) => x !== m)
  return [...rest, m].sort((a, b) => ORDER(a) - ORDER(b))
}

const sameMarks = (a: Mark[], b: Mark[]) => a.length === b.length && a.every((m, i) => m === b[i])

function normalize(segs: Seg[]): Seg[] {
  const out: Seg[] = []
  for (const s of segs) {
    if (!s.text) continue
    const last = out.at(-1)
    if (last && sameMarks(last.marks, s.marks)) last.text += s.text
    else out.push({ text: s.text, marks: [...s.marks].sort((a, b) => ORDER(a) - ORDER(b)) })
  }
  return out
}

export function render(segs: Seg[]): string {
  return segs
    .map(({ text, marks }) => {
      let h = escapeHtml(text).replace(/\n/g, '<br>')
      for (const m of [...marks].reverse()) {
        if (m.startsWith('a:')) h = `<a href="${escapeHtml(m.slice(2))}" target="_blank" rel="noopener noreferrer">${h}</a>`
        else if (m.startsWith('c:')) h = `<span data-color="${m.slice(2)}">${h}</span>`
        else h = `<${m}>${h}</${m}>`
      }
      return h
    })
    .join('')
}

export const plainText = (segs: Seg[]) => segs.map((s) => s.text).join('')

/** Split so that `at` falls on a segment boundary; returns the index of the segment starting at `at`. */
function cut(segs: Seg[], at: number): number {
  let pos = 0
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (at === pos) return i
    if (at < pos + s.text.length) {
      segs.splice(i, 1, { text: s.text.slice(0, at - pos), marks: s.marks }, { text: s.text.slice(at - pos), marks: s.marks })
      return i + 1
    }
    pos += s.text.length
  }
  return segs.length
}

function range(segs: Seg[], start: number, end: number): [Seg[], number, number] {
  const copy = segs.map((s) => ({ ...s }))
  const a = cut(copy, start)
  const b = cut(copy, end)
  return [copy, a, b]
}

/** Marks shared by every character in [start, end). */
export function marksIn(segs: Seg[], start: number, end: number): Mark[] {
  const [copy, a, b] = range(segs, start, end)
  const part = copy.slice(a, b)
  if (!part.length) return []
  return part[0].marks.filter((m) => part.every((s) => s.marks.includes(m)))
}

/** Add (on) or remove (off) a mark over [start, end). For colours/links, `mark` is the full value. */
export function setMark(segs: Seg[], start: number, end: number, mark: Mark, on: boolean): Seg[] {
  const [copy, a, b] = range(segs, start, end)
  const kind = mark.startsWith('a:') ? 'a:' : mark.startsWith('c:') ? 'c:' : null
  for (let i = a; i < b; i++) {
    const s = copy[i]
    if (on) s.marks = withMark(s.marks, mark)
    else s.marks = s.marks.filter((m) => (kind ? !m.startsWith(kind) : m !== mark))
  }
  return normalize(copy)
}

/** Bold-style toggle: if the whole range already has it, remove it; otherwise add it. */
export function toggleMark(segs: Seg[], start: number, end: number, mark: Mark): Seg[] {
  return setMark(segs, start, end, mark, !marksIn(segs, start, end).includes(mark))
}

export function clearMarks(segs: Seg[], start: number, end: number): Seg[] {
  const [copy, a, b] = range(segs, start, end)
  for (let i = a; i < b; i++) copy[i].marks = copy[i].marks.filter((m) => m.startsWith('a:'))
  return normalize(copy)
}

/** Replace [start, end) with `text` (keeps the marks of the character before, like typing). */
export function replaceText(segs: Seg[], start: number, end: number, text: string, marks?: Mark[]): Seg[] {
  const [copy, a, b] = range(segs, start, end)
  const inherit = marks ?? (a > 0 ? copy[a - 1].marks : copy[b]?.marks ?? [])
  copy.splice(a, b - a, { text, marks: inherit })
  return normalize(copy)
}

// ---- DOM selection ⇄ character offsets ----

function nodeLength(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return n.textContent?.length ?? 0
  if ((n as Element).tagName === 'BR') return 1
  let len = 0
  n.childNodes.forEach((c) => (len += nodeLength(c)))
  return len
}

/** Offset of a DOM point (container, offset) inside `root`. */
function pointOffset(root: Node, container: Node, offset: number): number {
  if (root === container) return [...root.childNodes].slice(0, offset).reduce((s, c) => s + nodeLength(c), 0)
  let total = 0
  const visit = (n: Node): boolean => {
    if (n === container) {
      if (n.nodeType === Node.TEXT_NODE) total += offset
      else for (let i = 0; i < offset; i++) total += nodeLength(n.childNodes[i])
      return true
    }
    if (n.nodeType === Node.TEXT_NODE || (n as Element).tagName === 'BR') {
      total += nodeLength(n)
      return false
    }
    for (const c of n.childNodes) if (visit(c)) return true
    return false
  }
  for (const c of root.childNodes) if (visit(c)) break
  return total
}

export function getSelectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null
  return { start: pointOffset(el, r.startContainer, r.startOffset), end: pointOffset(el, r.endContainer, r.endOffset) }
}

function locate(el: HTMLElement, offset: number): [Node, number] {
  let remaining = offset
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0
      if (remaining <= len) return [node, remaining]
      remaining -= len
    } else if ((node as Element).tagName === 'BR') {
      if (remaining === 0) return [node.parentNode!, [...node.parentNode!.childNodes].indexOf(node as ChildNode)]
      remaining -= 1
    }
  }
  return [el, el.childNodes.length]
}

export function setSelectionOffsets(el: HTMLElement, start: number, end = start) {
  el.focus()
  const range = document.createRange()
  range.setStart(...locate(el, start))
  range.setEnd(...locate(el, end))
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * Change an editable block's rich text and keep the selection. Writes the new HTML, restores
 * [start, end), then fires `input` so the block saves it through its normal path (one undo step).
 */
export function applyToEditable(el: HTMLElement, fn: (segs: Seg[]) => Seg[], sel?: { start: number; end: number }) {
  const segs = fn(parse(el.innerHTML))
  el.innerHTML = render(segs)
  if (sel) setSelectionOffsets(el, sel.start, sel.end)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
