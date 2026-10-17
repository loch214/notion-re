// Caret (text cursor) helpers for contentEditable blocks.

function selectionIn(el: HTMLElement): Range | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  return el.contains(r.startContainer) ? r : null
}

/** Character offset of the caret from the start of `el`'s text. */
export function caretOffset(el: HTMLElement): number {
  const r = selectionIn(el)
  if (!r) return 0
  const pre = document.createRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.startContainer, r.startOffset)
  return pre.toString().length
}

export function hasSelectionText(el: HTMLElement) {
  const r = selectionIn(el)
  return !!r && !r.collapsed
}

export function setCaret(el: HTMLElement, at: 'start' | 'end' | number) {
  el.focus()
  const sel = window.getSelection()!
  const range = document.createRange()
  if (at === 'start' || at === 'end') {
    range.selectNodeContents(el)
    range.collapse(at === 'start')
  } else {
    // Walk text nodes until we reach the requested character offset.
    let remaining = at
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node: Node | null
    let placed = false
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0
      if (remaining <= len) {
        range.setStart(node, remaining)
        placed = true
        break
      }
      remaining -= len
    }
    if (!placed) {
      range.selectNodeContents(el)
      range.collapse(false)
    } else range.collapse(true)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

export function caretAtStart(el: HTMLElement) {
  const r = selectionIn(el)
  return !!r && r.collapsed && caretOffset(el) === 0
}

export function caretAtEnd(el: HTMLElement) {
  const r = selectionIn(el)
  return !!r && r.collapsed && caretOffset(el) === (el.textContent ?? '').length
}

function caretRect(el: HTMLElement): DOMRect | null {
  const r = selectionIn(el)
  if (!r) return null
  const rects = r.getClientRects()
  if (rects.length) return rects[0]
  return null
}

/** True when the caret is on the first visual line (so ArrowUp should leave the block). */
export function caretOnFirstLine(el: HTMLElement) {
  if (caretAtStart(el)) return true
  const c = caretRect(el)
  if (!c) return true
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
  return c.top - el.getBoundingClientRect().top < lh * 0.8
}

export function caretOnLastLine(el: HTMLElement) {
  if (caretAtEnd(el)) return true
  const c = caretRect(el)
  if (!c) return true
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
  return el.getBoundingClientRect().bottom - c.bottom < lh * 0.8
}

/** Split the block's HTML at the caret. Returns [before, after]; mutates nothing. */
export function splitAtCaret(el: HTMLElement): [string, string] {
  const r = selectionIn(el)
  if (!r) return [el.innerHTML, '']
  const after = document.createRange()
  after.selectNodeContents(el)
  after.setStart(r.endContainer, r.endOffset)
  const before = document.createRange()
  before.selectNodeContents(el)
  before.setEnd(r.startContainer, r.startOffset)
  const toHtml = (range: Range) => {
    const d = document.createElement('div')
    d.appendChild(range.cloneContents())
    return d.innerHTML
  }
  return [toHtml(before), toHtml(after)]
}

/** Delete the characters between two text offsets and leave the caret there. */
export function deleteTextRange(el: HTMLElement, from: number, to: number) {
  const locate = (offset: number): [Node, number] => {
    let remaining = offset
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node: Node | null
    let last: Node | null = null
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0
      if (remaining <= len) return [node, remaining]
      remaining -= len
      last = node
    }
    return last ? [last, last.textContent?.length ?? 0] : [el, 0]
  }
  const range = document.createRange()
  range.setStart(...locate(from))
  range.setEnd(...locate(to))
  range.deleteContents()
  setCaret(el, from)
}

/** Viewport rect of the caret, for positioning popups (slash menu). */
export function caretClientRect(el: HTMLElement): DOMRect {
  return caretRect(el) ?? el.getBoundingClientRect()
}
