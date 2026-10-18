import { useEffect, useRef, useState } from 'react'
import { htmlToText } from '../markdown'
import { useStore, visibleOrder, type BlockTree } from '../store'

/** Last copy / cut of blocks: the text that went on the system clipboard + the blocks themselves. */
export const blockClip: { text: string; trees: BlockTree[] } = { text: '', trees: [] }

const S = useStore.getState

function toTree(id: string): BlockTree {
  const b = S().blocks[id]
  return {
    type: b.type,
    title: b.properties.title,
    properties: { ...b.properties },
    format: { ...b.format },
    children: b.content.filter((c) => S().blocks[c]?.alive).map(toTree),
  }
}

function toText(id: string, depth = 0): string {
  const b = S().blocks[id]
  const own = b.type === 'divider' ? '---' : htmlToText(b.properties.title)
  const kids = b.content.filter((c) => S().blocks[c]?.alive).map((c) => toText(c, depth + 1))
  return [('  '.repeat(depth) + own), ...kids].join('\n')
}

/** Selected blocks that aren't inside another selected block. */
function topLevel(ids: string[]): string[] {
  const set = new Set(ids)
  const { blocks } = S()
  return ids.filter((id) => {
    for (let p = blocks[id]?.parent_id; p; p = blocks[p]?.parent_id) if (set.has(p)) return false
    return true
  })
}

/** Paste copied blocks after `after` (returns the last new block id). */
export function pasteBlocks(after: string): string {
  let at = after
  for (const t of blockClip.trees) at = S().insertTree({ after: at }, t)
  return at
}

/** Esc selects a block; Shift+click / Shift+↑↓ extend; drag on the page margin to rubber-band select. */
export function BlockSelection({ pageId }: { pageId: string }) {
  const selection = useStore((s) => s.selection)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const anchor = useRef<string | null>(null)
  const head = useRef<string | null>(null)

  useEffect(() => {
    if (selection.length === 1) anchor.current = head.current = selection[0]
    if (!selection.length) anchor.current = head.current = null
  }, [selection])

  // Leaving the page drops the selection.
  useEffect(() => () => S().setSelection([]), [pageId])

  useEffect(() => {
    const order = () => visibleOrder(S().blocks, pageId)
    const range = (a: string, b: string) => {
      const o = order()
      const i = o.indexOf(a)
      const j = o.indexOf(b)
      if (i < 0 || j < 0) return [b]
      return o.slice(Math.min(i, j), Math.max(i, j) + 1)
    }
    const editing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
    }

    const onKey = (e: KeyboardEvent) => {
      const sel = S().selection
      if (!sel.length || editing(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const o = order()
      if (e.key === 'Escape') return S().setSelection([])
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const d = e.key === 'ArrowUp' ? -1 : 1
        const next = o[o.indexOf(head.current ?? sel[0]) + d]
        if (!next) return
        head.current = next
        if (e.shiftKey) S().setSelection(range(anchor.current ?? next, next))
        else {
          anchor.current = next
          S().setSelection([next])
        }
        document.querySelector(`.block-row[data-block-id="${next}"]`)?.scrollIntoView({ block: 'nearest' })
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const id = sel[0]
        S().setSelection([])
        S().requestFocus({ id, at: 'end' })
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        const top = topLevel(sel)
        const prev = o[o.indexOf(top[0]) - 1]
        S().transact(() => top.forEach((id) => S().removeBlock(id)))
        S().setSelection([])
        if (prev && S().blocks[prev]?.alive) S().requestFocus({ id: prev, at: 'end' })
        return
      }
      if (mod && key === 'd') {
        e.preventDefault()
        const copies: string[] = []
        S().transact(() => topLevel(sel).forEach((id) => copies.push(S().duplicate(id))))
        S().setSelection(copies)
        return
      }
      if (mod && key === 'a') {
        e.preventDefault()
        S().setSelection(o)
        return
      }
      // Any other typing leaves block selection (shortcuts with Ctrl/Cmd, Shift alone, Tab keep it).
      if (!mod && e.key.length === 1) S().setSelection([])
    }

    const clip = (cut: boolean) => (e: ClipboardEvent) => {
      const sel = S().selection
      if (!sel.length || editing(e.target)) return
      e.preventDefault()
      const top = topLevel(sel)
      blockClip.trees = top.map(toTree)
      blockClip.text = top.map((id) => toText(id)).join('\n')
      e.clipboardData?.setData('text/plain', blockClip.text)
      if (cut) {
        S().transact(() => top.forEach((id) => S().removeBlock(id)))
        S().setSelection([])
      }
    }
    const onCopy = clip(false)
    const onCut = clip(true)
    const onPaste = (e: ClipboardEvent) => {
      const sel = S().selection
      if (!sel.length || editing(e.target)) return
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!blockClip.trees.length || text !== blockClip.text) return
      const top = topLevel(sel)
      S().transact(() => pasteBlocks(top[top.length - 1]))
    }

    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (e.button !== 0 || !t.closest?.('.page')) {
        if (S().selection.length && !t.closest?.('.popover,.modal')) S().setSelection([])
        return
      }
      const rowId = t.closest<HTMLElement>('.block-row')?.dataset.blockId
      if (e.shiftKey && rowId && !t.closest('.block-controls')) {
        e.preventDefault()
        const active = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('.block-row')?.dataset.blockId
        const from = anchor.current ?? active ?? rowId
        anchor.current = from
        head.current = rowId
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        S().setSelection(range(from, rowId))
        return
      }
      if (S().selection.length && !(rowId && S().selection.includes(rowId) && t.closest('.block-controls'))) S().setSelection([])
      // Rubber band: only from empty space (page margins), not from text, buttons or inputs.
      if (editing(t) || t.closest('button,a,.block-controls,.database,.cover,.page-title,.media-block,table')) return
      if (!t.closest('.page-inner,.blocks,.page')) return
      const sx = e.clientX
      const sy = e.clientY
      let on = false
      const move = (m: MouseEvent) => {
        if (!on && Math.hypot(m.clientX - sx, m.clientY - sy) < 5) return
        on = true
        const r = { x: Math.min(sx, m.clientX), y: Math.min(sy, m.clientY), w: Math.abs(m.clientX - sx), h: Math.abs(m.clientY - sy) }
        setBox(r)
        const hit = order().filter((id) => {
          const el = document.querySelector(`.block-row[data-block-id="${id}"] > .block-main`)
          if (!el) return false
          const b = el.getBoundingClientRect()
          return b.right > r.x && b.left < r.x + r.w && b.bottom > r.y && b.top < r.y + r.h
        })
        S().setSelection(hit)
        if (hit.length) {
          anchor.current = hit[0]
          head.current = hit[hit.length - 1]
        }
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        window.getSelection()?.removeAllRanges()
      }
      const up = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        setBox(null)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    }

    // Focusing a text block ends block selection.
    const onFocusIn = (e: FocusEvent) => {
      if (S().selection.length && editing(e.target)) S().setSelection([])
    }

    window.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [pageId])

  return box ? <div className="select-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} /> : null
}
