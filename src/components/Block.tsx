import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import {
  caretAtStart,
  caretClientRect,
  caretOffset,
  caretOnFirstLine,
  caretOnLastLine,
  deleteTextRange,
  setCaret,
  splitAtCaret,
} from '../caret'
import { htmlToText, inlineMarkdownToHtml, markdownToBlocks, sanitizeHtml } from '../markdown'
import { COLOR_NAMES, escapeHtml } from '../../shared/blocks.ts'
import { pageTitle, useStore, visibleOrder } from '../store'
import type { Block, BlockColor, BlockType } from '../types'
import { activeSelection, clearFormatting, toggle, toggleHighlight } from '../formatting'
import { getSelectionOffsets, marksIn, parse, plainText, render, replaceText, setMark, setSelectionOffsets, type Mark } from '../richtext'
import { blockClip, pasteBlocks } from './BlockSelection'
import { EmojiPicker } from './Pickers'
import { DatabaseView } from './DatabaseViews'
import { AIInline } from './AIInline'
import { DragIcon, PlusIcon, TriangleIcon } from './Icons'
import { filterMenu, MENU_ITEMS, SlashMenu, type MenuItem } from './SlashMenu'
import { Columns, MediaBlock, TableBlock, TableOfContents } from './SpecialBlocks'

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  header: 'Heading 1',
  sub_header: 'Heading 2',
  sub_sub_header: 'Heading 3',
  header_4: 'Heading 4',
  bulleted_list: 'List',
  numbered_list: 'List',
  to_do: 'To-do',
  toggle: 'Toggle',
  quote: 'Quote',
  callout: 'Callout',
  code: 'Code',
}

export const HEADINGS = new Set<BlockType>(['header', 'sub_header', 'sub_sub_header', 'header_4'])
/** Types that keep their type when you press Enter (Notion behaviour). */
const CONTINUES = new Set<BlockType>(['bulleted_list', 'numbered_list', 'to_do', 'toggle'])
const NOT_EDITABLE = new Set<BlockType>(['divider', 'page', 'image', 'video', 'embed', 'bookmark', 'table', 'table_row', 'table_of_contents', 'column_list', 'column'])
const MEDIA = new Set<BlockType>(['image', 'video', 'embed', 'bookmark'])
export const CODE_LANGUAGES = ['plain text', 'bash', 'c', 'c#', 'c++', 'css', 'go', 'html', 'java', 'javascript', 'json', 'kotlin', 'markdown', 'php', 'powershell', 'python', 'ruby', 'rust', 'sql', 'swift', 'typescript', 'yaml']

/** Markdown shortcuts typed at the start of a line, then Space (Notion's list, analysis/app-map.md §4.1). */
const SHORTCUTS: Record<string, BlockType> = {
  '#': 'header',
  '##': 'sub_header',
  '###': 'sub_sub_header',
  '####': 'header_4',
  '-': 'bulleted_list',
  '*': 'bulleted_list',
  '+': 'bulleted_list',
  '•': 'bulleted_list',
  '[]': 'to_do',
  '[ ]': 'to_do',
  '[x]': 'to_do',
  '[X]': 'to_do',
  '>': 'toggle',
  '"': 'quote',
  '“': 'quote',
  '|': 'quote',
}

/** Ctrl+Shift+0…9 (Cmd+Alt+0…9 on Mac): turn the block into… (9 = page). */
const TURN_INTO_KEYS: (BlockType | 'page')[] = ['text', 'header', 'sub_header', 'sub_sub_header', 'to_do', 'bulleted_list', 'numbered_list', 'toggle', 'code', 'page']

/** Inline Markdown applied when the closing delimiter is typed: **bold**, *italic*, ~strike~, `code`. */
const INLINE_RULES: { re: RegExp; mark: Mark; d: number }[] = [
  { re: /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, mark: 'b', d: 2 },
  { re: /__([^_\s](?:[^_]*[^_\s])?)__$/, mark: 'b', d: 2 },
  { re: /(?:^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, mark: 'i', d: 1 },
  { re: /(?:^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, mark: 'i', d: 1 },
  { re: /(?:^|[^~])~([^~\s](?:[^~]*[^~\s])?)~$/, mark: 's', d: 1 },
  { re: /`([^`]+)`$/, mark: 'code', d: 1 },
]

/** Notion's typing replacements (em dash, arrows, ≥ ≤ ≠, ellipsis). Smart quotes are left out. */
const REPLACEMENTS: [RegExp, number, string][] = [
  [/<->$/, 3, '↔'],
  [/←>$/, 2, '↔'],
  [/--$/, 2, '—'],
  [/->$/, 2, '→'],
  [/=>$/, 2, '⇒'],
  [/<-$/, 2, '←'],
  [/>=$/, 2, '≥'],
  [/<=$/, 2, '≤'],
  [/!=$/, 2, '≠'],
  [/\.\.\.$/, 3, '…'],
]

const toLetters = (n: number) => {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s
  return s
}
const toRoman = (n: number) => {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let s = ''
  for (const [v, r] of t) for (; n >= v; n -= v) s += r
  return s
}
/** Notion cycles list markers by nesting depth: 1. a. i. / • ◦ ▪. */
const NUMBER_FORMATS = ['numbers', 'letters', 'roman'] as const
const BULLETS: Record<string, string> = { disc: '•', circle: '◦', square: '▪' }
const BULLET_FORMATS = ['disc', 'circle', 'square'] as const

export function listMarker(block: Block, number: number, depth: number): string {
  if (block.type === 'bulleted_list') return BULLETS[block.format.list_format ?? BULLET_FORMATS[depth % 3]] ?? '•'
  const f = block.format.list_format ?? NUMBER_FORMATS[depth % 3]
  return (f === 'letters' ? toLetters(number) : f === 'roman' ? toRoman(number) : String(number)) + '.'
}


const LAZY_FROM = 80
const LAZY_STEP = 60

export function BlockList({ ids, pageId, depth = 0 }: { ids: string[]; pageId: string; depth?: number }) {
  const blocks = useStore((s) => s.blocks)
  // Very long pages render in chunks as you scroll, so opening them stays fast.
  const lazy = depth === 0 && ids.length > LAZY_FROM
  const [shown, setShown] = useState(LAZY_STEP)
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!lazy || shown >= ids.length || !sentinel.current) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setShown((n) => n + LAZY_STEP), { rootMargin: '1200px' })
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [lazy, shown, ids.length])
  const visible = lazy ? ids.slice(0, shown) : ids
  let n = 0
  return (
    <>
      {visible.map((id) => {
        const b = blocks[id]
        if (!b?.alive) return null
        // A run of numbered items counts up from the first item's start number ("5. " starts at 5).
        n = b.type === 'numbered_list' ? (n === 0 ? b.format.list_start_index ?? 1 : n + 1) : 0
        return <BlockView key={id} id={id} pageId={pageId} number={n} depth={depth} />
      })}
      {lazy && shown < ids.length && <div ref={sentinel} style={{ height: 1 }} />}
    </>
  )
}

interface MentionState {
  start: number
  query: string
  active: number
  rect: DOMRect
}

const dateLabel = (plus = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + plus)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Items for the @ menu: matching pages (most recently edited first), then a few dates. */
function mentionItems(query: string, selfPage: string): MenuItem[] {
  const q = query.trim().toLowerCase()
  const { blocks } = useStore.getState()
  const pages = Object.values(blocks)
    .filter((b) => b.type === 'page' && b.alive && b.id !== selfPage && !blocks[b.parent_id ?? '']?.schema && pageTitle(b).toLowerCase().includes(q))
    .sort((a, b) => b.last_edited_time - a.last_edited_time)
    .slice(0, 8)
    .map((b): MenuItem => ({ key: `page:${b.id}`, label: pageTitle(b), hint: 'Link to page', icon: b.format.icon ?? '📄', aliases: [], section: 'Pages' }))
  const dates: [string, number][] = [['Today', 0], ['Tomorrow', 1], ['Yesterday', -1]]
  const dateItems = dates
    .filter(([n]) => q && n.toLowerCase().startsWith(q))
    .map(([n, d]): MenuItem => ({ key: `date:${dateLabel(d)}`, label: n, hint: dateLabel(d), icon: '📅', aliases: [], section: 'Dates' }))
  return [...pages, ...dateItems]
}

interface SlashState {
  start: number
  query: string
  active: number
  rect: DOMRect
}

function BlockView({ id, pageId, number, depth }: { id: string; pageId: string; number: number; depth: number }) {
  const block = useStore((s) => s.blocks[id]) as Block
  const focus = useStore((s) => s.focus)
  const selected = useStore((s) => s.selection.includes(id))
  // "Lock page": text can still be read, selected and copied, and toggles opened — not edited.
  const locked = useStore((s) => !!s.blocks[pageId]?.format.locked)
  const ref = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const localHtml = useRef<string | null>(null)
  const pendingSlash = useRef<number | null>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [mention, setMention] = useState<MentionState | null>(null)
  const [iconRect, setIconRect] = useState<DOMRect | null>(null)
  const pendingMention = useRef<number | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiSelection, setAiSelection] = useState<{ start: number; end: number; text: string } | undefined>()

  // "Ask AI" from the selection toolbar.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const open = (e: Event) => {
      if ((e.target as HTMLElement) !== row) return
      setAiSelection((e as CustomEvent).detail)
      setAiOpen(true)
    }
    row.addEventListener('nre:ask-ai', open)
    return () => row.removeEventListener('nre:ask-ai', open)
  }, [])
  const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const isCode = block.type === 'code'

  // Push store text into the DOM only when it changed from outside this element
  // (merge, AI insert, undo…). Our own typing is skipped so the caret isn't lost.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || block.properties.title === localHtml.current) return
    if (isCode) el.textContent = block.properties.title
    else el.innerHTML = block.properties.title
    localHtml.current = block.properties.title
  }, [block.properties.title, isCode])

  useLayoutEffect(() => {
    if (focus?.id !== id || !ref.current) return
    setCaret(ref.current, focus.at)
    useStore.getState().requestFocus(null)
  }, [focus, id])

  const S = () => useStore.getState()

  const save = () => {
    const el = ref.current!
    if (!isCode && (el.innerHTML === '<br>' || el.innerHTML === '<div><br></div>')) el.innerHTML = ''
    const html = isCode ? el.textContent ?? '' : sanitizeHtml(el.innerHTML)
    localHtml.current = html
    S().updateBlock(id, { properties: { title: html } })
  }

  const focusSibling = (dir: -1 | 1, at: 'start' | 'end') => {
    const { blocks, requestFocus } = S()
    const order = visibleOrder(blocks, pageId).filter((b) => !NOT_EDITABLE.has(blocks[b].type))
    const target = order[order.indexOf(id) + dir]
    if (target) requestFocus({ id: target, at })
    else if (dir === -1) document.querySelector<HTMLElement>('.page-title')?.focus()
  }

  // After "**bold**" turns bold, the next typed text must not be bold (Notion behaviour), but the
  // browser would type inside the <b>. So the next insert at that spot is done by hand, unmarked.
  const exitMark = useRef<{ at: number; mark: Mark } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onBeforeInput = (e: InputEvent) => {
      const pending = exitMark.current
      exitMark.current = null
      if (!pending || e.inputType !== 'insertText' || !e.data) return
      const off = getSelectionOffsets(el)
      if (!off || off.start !== off.end || off.start !== pending.at) return
      e.preventDefault()
      const segs = parse(el.innerHTML)
      const marks = (pending.at > 0 ? marksIn(segs, pending.at - 1, pending.at) : []).filter((m) => m !== pending.mark)
      el.innerHTML = render(replaceText(segs, pending.at, pending.at, e.data, marks))
      setSelectionOffsets(el, pending.at + e.data.length)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    el.addEventListener('beforeinput', onBeforeInput)
    return () => el.removeEventListener('beforeinput', onBeforeInput)
  }, [block.type])

  /** After a typed character: inline Markdown (**x**, `x`…) and Notion's replacements (-- → —). */
  const autoFormat = (typed: string) => {
    const el = ref.current!
    const off = getSelectionOffsets(el)
    if (!off || off.start !== off.end) return
    const at = off.start
    let segs = parse(el.innerHTML)
    if (at > 0 && marksIn(segs, at - 1, at).includes('code') && typed !== '`') return
    const before = plainText(segs).slice(0, at)
    for (const r of '*_~`'.includes(typed) ? INLINE_RULES : []) {
      const m = before.match(r.re)
      if (!m) continue
      const innerEnd = at - r.d
      const innerStart = innerEnd - m[1].length
      segs = replaceText(segs, innerEnd, at, '')
      segs = replaceText(segs, innerStart - r.d, innerStart, '')
      segs = setMark(segs, innerStart - r.d, innerEnd - r.d, r.mark, true)
      el.innerHTML = render(segs)
      setSelectionOffsets(el, innerEnd - r.d)
      exitMark.current = { at: innerEnd - r.d, mark: r.mark }
      return
    }
    for (const [re, len, rep] of REPLACEMENTS) {
      if (!re.test(before)) continue
      segs = replaceText(segs, at - len, at, rep)
      el.innerHTML = render(segs)
      setSelectionOffsets(el, at - len + rep.length)
      return
    }
  }

  const onInput = (ev?: InputEvent) => {
    const el = ref.current!
    if (!isCode && ev?.inputType === 'insertText' && ev.data && '*_~`->=.'.includes(ev.data.slice(-1))) autoFormat(ev.data.slice(-1))
    const text = el.textContent ?? ''

    if (!isCode && text === '```') {
      el.textContent = ''
      save()
      S().setType(id, 'code')
      S().requestFocus({ id, at: 'start' })
      return
    }
    if (!isCode && text === '---') {
      el.textContent = ''
      save()
      S().setType(id, 'divider')
      const next = S().insertBlock({ after: id })
      S().requestFocus({ id: next, at: 'start' })
      return
    }

    if (!isCode && !mention && ev?.inputType === 'insertText' && text.slice(0, caretOffset(el)).endsWith('[[')) {
      // "[[" opens the page picker too.
      const c = caretOffset(el)
      deleteTextRange(el, c - 2, c)
      document.execCommand('insertText', false, '@')
      setMention({ start: c - 2, query: '', active: 0, rect: caretClientRect(el) })
    } else if (pendingMention.current !== null) {
      setMention({ start: pendingMention.current, query: '', active: 0, rect: caretClientRect(el) })
      pendingMention.current = null
    } else if (mention) {
      const caret = caretOffset(el)
      const t = el.textContent ?? ''
      if (caret <= mention.start || t[mention.start] !== '@') setMention(null)
      else {
        const query = t.slice(mention.start + 1, caret)
        if (query.endsWith('  ') || (query.endsWith(' ') && mentionItems(query, pageId).length === 0)) setMention(null)
        else setMention({ ...mention, query, active: 0 })
      }
    }

    if (pendingSlash.current !== null) {
      setSlash({ start: pendingSlash.current, query: '', active: 0, rect: caretClientRect(el) })
      pendingSlash.current = null
    } else if (slash) {
      const caret = caretOffset(el)
      if (caret <= slash.start || text[slash.start] !== '/') setSlash(null)
      else {
        const query = text.slice(slash.start + 1, caret)
        if (query.endsWith('  ') || (query.endsWith(' ') && filterMenu(query).length === 0)) setSlash(null)
        else setSlash({ ...slash, query, active: 0 })
      }
    }
    save()
  }

  const pick = (item: MenuItem) => {
    const el = ref.current!
    if (slash) deleteTextRange(el, slash.start, slash.start + 1 + slash.query.length)
    setSlash(null)
    save()
    const { blocks, setType, insertBlock, requestFocus, removeBlock, openPage, createDatabase } = S()
    const empty = !blocks[id].properties.title

    if (item.key === 'ai') return setAiOpen(true)
    if (item.key === 'link_page') {
      el.focus()
      pendingMention.current = caretOffset(el)
      document.execCommand('insertText', false, '@')
      return
    }
    if (item.key === 'database_inline') {
      createDatabase({ parent: blocks[id].parent_id!, after: id, inline: true })
      if (empty && block.type === 'text') removeBlock(id)
      return
    }
    if (item.key === 'database') {
      createDatabase({ parent: blocks[id].parent_id!, after: id })
      if (empty && block.type === 'text') removeBlock(id)
      return
    }
    if (item.key === 'page') {
      const pid = insertBlock({ after: id, type: 'page' })
      if (empty && block.type === 'text') removeBlock(id)
      openPage(pid)
      return
    }
    if (item.key.startsWith('columns_')) {
      const n = +item.key.slice(8)
      const cols = Array.from({ length: n }, () => ({ type: 'column' as const, children: [{ type: 'text' as const }] }))
      const cl = S().insertTree({ after: id }, { type: 'column_list', children: cols })
      if (empty && block.type === 'text') removeBlock(id)
      const first = S().blocks[S().blocks[cl].content[0]].content[0]
      return requestFocus({ id: first, at: 'start' })
    }
    if (item.key === 'table') {
      const row = { type: 'table_row' as const, properties: { row: ['', '', ''] } }
      S().insertTree({ after: id }, { type: 'table', format: { table_width: 3 }, children: [row, row, row] })
      if (empty && block.type === 'text') removeBlock(id)
      return
    }
    const type = item.key as BlockType
    if (NOT_EDITABLE.has(type)) {
      // Media / table of contents: a new block below (or in place of an empty line).
      S().insertTree({ after: id }, { type })
      if (empty && block.type === 'text') removeBlock(id)
      return
    }
    let target = id
    if (empty) setType(id, type)
    else target = insertBlock({ after: id, type })
    if (type === 'divider') {
      const next = insertBlock({ after: target })
      requestFocus({ id: next, at: 'start' })
    } else requestFocus({ id: target, at: 'end' })
  }

  const pickMention = (item: MenuItem) => {
    const el = ref.current!
    if (!mention) return
    deleteTextRange(el, mention.start, mention.start + 1 + mention.query.length)
    setMention(null)
    if (item.key.startsWith('page:')) {
      const target = S().blocks[item.key.slice(5)]
      document.execCommand('insertHTML', false, `<a href="#/${target.id}">${escapeHtml((target.format.icon ?? '📄') + ' ' + pageTitle(target))}</a>&nbsp;`)
    } else document.execCommand('insertText', false, item.key.slice(5) + ' ')
    save()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current!
    const store = S()

    if (mention) {
      const items = mentionItems(mention.query, pageId)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setMention({ ...mention, active: (mention.active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1) })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (items[mention.active]) pickMention(items[mention.active])
        else setMention(null)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
        return
      }
    }

    if (slash) {
      const items = filterMenu(slash.query)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setSlash({ ...slash, active: (slash.active + d + items.length) % Math.max(items.length, 1) })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (items[slash.active]) pick(items[slash.active])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlash(null)
        return
      }
    }

    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    // ---- text formatting (selection) ----
    if (mod && !isCode) {
      const sel = activeSelection()
      const fmt = (fn: () => void) => {
        e.preventDefault()
        e.stopPropagation()
        if (sel) fn()
      }
      if (!e.shiftKey && !e.altKey && (key === 'b' || key === 'i' || key === 'u') && sel) return fmt(() => toggle(sel, key as 'b'))
      if (!e.shiftKey && !e.altKey && key === 'e') return fmt(() => toggle(sel!, 'code'))
      if (e.shiftKey && !e.altKey && (key === 's' || key === 'x')) return fmt(() => toggle(sel!, 's'))
      if (e.shiftKey && !e.altKey && key === 'h') return fmt(() => toggleHighlight(sel!))
      if (e.altKey && (e.key === '\\' || e.code === 'Backslash')) return fmt(() => clearFormatting(sel!))
      if (!e.shiftKey && !e.altKey && key === 'k' && sel) {
        e.preventDefault()
        e.stopPropagation()
        window.dispatchEvent(new Event('nre:link'))
        return
      }
    }

    // ---- block commands ----
    if (mod && !e.shiftKey && !e.altKey && key === 'd') {
      e.preventDefault()
      const copy = store.duplicate(id)
      store.requestFocus({ id: copy, at: 'end' })
      return
    }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const at = caretOffset(el)
      const siblings = store.blocks[block.parent_id!]?.content.filter((c) => store.blocks[c]?.alive) ?? []
      const i = siblings.indexOf(id)
      const target = siblings[i + (e.key === 'ArrowUp' ? -1 : 1)]
      if (target) store.moveBlock(id, target, e.key === 'ArrowUp' ? 'before' : 'after')
      store.requestFocus({ id, at })
      return
    }
    // Ctrl+Shift+0…9 (Windows/Linux) · Cmd+Alt+0…9 (Mac): turn into.
    const digit = /^Digit(\d)$/.exec(e.code)?.[1]
    if (digit && mod && (e.metaKey ? e.altKey : e.shiftKey && !e.altKey)) {
      e.preventDefault()
      const to = TURN_INTO_KEYS[+digit]
      if (to === 'page') {
        save()
        store.turnIntoPage(id)
        return
      }
      if (to !== block.type) store.setType(id, to)
      store.requestFocus({ id, at: caretOffset(el) })
      return
    }

    if (e.key === '@' && !isCode && !e.ctrlKey && !e.metaKey) {
      const before = (el.textContent ?? '').slice(0, caretOffset(el))
      if (!before || /\s$/.test(before)) pendingMention.current = caretOffset(el)
      return
    }

    if (e.key === '/' && !isCode) {
      pendingSlash.current = caretOffset(el)
      return
    }

    if (e.key === ' ' && !isCode) {
      const offset = caretOffset(el)
      const before = (el.textContent ?? '').slice(0, offset)
      // Space on an empty line opens the AI prompt, like Notion.
      if (!el.textContent && block.type === 'text') {
        e.preventDefault()
        setAiOpen(true)
        return
      }
      const convert = (type: BlockType, format?: Partial<Block['format']>, checked?: boolean) => {
        e.preventDefault()
        deleteTextRange(el, 0, offset)
        save()
        if (type !== block.type) store.setType(id, type)
        if (format) store.updateBlock(id, { format })
        if (checked) store.updateBlock(id, { properties: { checked: true } })
        store.requestFocus({ id, at: 'start' })
      }
      // "# " then "> " → toggle heading.
      if (before === '>' && HEADINGS.has(block.type) && !block.format.toggleable) return convert(block.type, { toggleable: true })
      const type = SHORTCUTS[before]
      if (type && (type !== block.type || before.startsWith('[x') || before.startsWith('[X'))) {
        if (block.type === 'code' || (type === 'quote' && block.type === 'callout')) return
        return convert(type, undefined, /^\[[xX]\]$/.test(before))
      }
      // Numbered lists: "1." "1)" (any number sets the start), "a." letters, "i." roman numerals.
      const num = /^(\d+)[.)]$/.exec(before)
      if (num && block.type !== 'numbered_list') {
        const start = parseInt(num[1], 10)
        return convert('numbered_list', start !== 1 ? { list_start_index: start } : undefined)
      }
      if (/^[aA][.)]$/.test(before) && block.type !== 'numbered_list') return convert('numbered_list', { list_format: 'letters' })
      if (/^[iI][.)]$/.test(before) && block.type !== 'numbered_list') return convert('numbered_list', { list_format: 'roman' })
    }

    if (e.key === 'Enter' && isCode) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Leave the code block.
        e.preventDefault()
        const next = store.insertBlock({ after: id })
        store.requestFocus({ id: next, at: 'start' })
        return
      }
      e.preventDefault()
      document.execCommand('insertText', false, '\n')
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = el.textContent ?? ''
      if (!text && block.type !== 'text') {
        // Empty nested list item: move out one level first; at the top level it becomes text.
        const parent = store.blocks[block.parent_id!]
        if (CONTINUES.has(block.type) && parent && parent.type !== 'page' && parent.type !== 'column') {
          store.outdent(id)
          store.requestFocus({ id, at: 'start' })
          return
        }
        store.setType(id, 'text')
        return
      }
      const [before, after] = splitAtCaret(el)
      const cleanBefore = sanitizeHtml(before)
      store.updateBlock(id, { properties: { title: cleanBefore } })
      const type = CONTINUES.has(block.type) ? block.type : 'text'
      const hasOpenChildren = block.content.some((c) => store.blocks[c]?.alive) && !(isToggle && block.format.collapsed)
      const next = hasOpenChildren
        ? store.insertBlock({ parent: id, index: 0, type, title: sanitizeHtml(after) })
        : store.insertBlock({ after: id, type, title: sanitizeHtml(after) })
      store.requestFocus({ id: next, at: 'start' })
      return
    }

    if (e.key === 'Backspace' && caretAtStart(el)) {
      e.preventDefault()
      if (block.type !== 'text') {
        store.setType(id, 'text')
        store.requestFocus({ id, at: 'start' })
        return
      }
      const order = visibleOrder(store.blocks, pageId)
      const prevId = order[order.indexOf(id) - 1]
      if (!prevId) return
      const prev = store.blocks[prevId]
      if (prev.type === 'divider') {
        store.removeBlock(prevId)
        return
      }
      if (prev.type === 'page') return focusSibling(-1, 'end')
      if (NOT_EDITABLE.has(prev.type) || (prev.parent_id !== block.parent_id && store.blocks[prev.parent_id!]?.type === 'column')) {
        // Can't merge text into an image, table or column: just drop this line if it's empty.
        if (!block.properties.title && !block.content.length) {
          store.removeBlock(id)
          focusSibling(-1, 'end')
        }
        return
      }
      const prevLen = htmlToText(prev.properties.title).length
      const merged = prev.type === 'code' ? prev.properties.title + (el.textContent ?? '') : prev.properties.title + block.properties.title
      store.updateBlock(prevId, { properties: { title: merged } })
      // Children of the removed block move up to the previous block.
      for (const c of [...block.content].reverse()) store.moveBlock(c, prevId, 'after')
      store.removeBlock(id)
      store.requestFocus({ id: prevId, at: prevLen })
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const at = caretOffset(el)
      if (e.shiftKey) store.outdent(id)
      else store.indent(id)
      store.requestFocus({ id, at })
      return
    }

    if (e.key === 'ArrowUp' && caretOnFirstLine(el)) {
      e.preventDefault()
      focusSibling(-1, 'end')
      return
    }
    if (e.key === 'ArrowDown' && caretOnLastLine(el)) {
      e.preventDefault()
      focusSibling(1, 'end')
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      store.setSelection([id])
      el.blur()
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (blockClip.trees.length && text === blockClip.text && !isCode) {
      S().transact(() => {
        const last = pasteBlocks(id)
        if (!block.properties.title && block.type === 'text' && !block.content.length) S().removeBlock(id)
        S().requestFocus({ id: last, at: 'end' })
      })
      return
    }
    if (isCode || !text.includes('\n')) {
      document.execCommand('insertText', false, text)
      return
    }
    // Multi-line paste: first line joins this block, the rest become new blocks.
    const [first, ...rest] = text.split(/\r?\n/)
    document.execCommand('insertHTML', false, inlineMarkdownToHtml(first))
    save()
    let after = id
    for (const spec of markdownToBlocks(rest.join('\n'))) {
      after = S().insertBlock({ after, type: spec.type, title: spec.title })
    }
    S().requestFocus({ id: after, at: 'end' })
  }

  // ---- drag & drop ----
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-block')) return
    e.preventDefault()
    e.stopPropagation()
    const main = (e.currentTarget as HTMLElement).querySelector(':scope > .block-main')!.getBoundingClientRect()
    setDropPos(e.clientY < main.top + main.height / 2 ? 'before' : 'after')
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const dragged = e.dataTransfer.getData('application/x-block')
    if (dragged && dropPos) S().moveBlock(dragged, id, dropPos)
    setDropPos(null)
  }

  // ---- rendering ----
  const editable = (
    <div
      ref={ref}
      className="editable"
      contentEditable={locked ? false : isCode ? 'plaintext-only' : true}
      suppressContentEditableWarning
      spellCheck={!isCode}
      data-placeholder={PLACEHOLDER[block.type] ?? "Type '/' for commands, or space for AI…"}
      // One key press / input = at most one undo step, even when it does several edits.
      onInput={(e) => S().transact(() => onInput(e.nativeEvent as InputEvent))}
      onKeyDown={(e) => S().transact(() => onKeyDown(e))}
      onPaste={onPaste}
      onBlur={() =>
        setTimeout(() => {
          setSlash(null)
          setMention(null)
        }, 150)
      }
      onClick={(e) => {
        // Links to other pages open in the app; ordinary links open with Ctrl+click.
        const a = (e.target as HTMLElement).closest('a')
        const href = a?.getAttribute('href') ?? ''
        if (href.startsWith('#/')) {
          e.preventDefault()
          const target = href.slice(2)
          if (S().blocks[target]?.alive) S().openPage(target)
        } else if (a && (e.ctrlKey || e.metaKey)) window.open(href, '_blank', 'noopener')
      }}
    />
  )

  const isToggle = block.type === 'toggle' || (HEADINGS.has(block.type) && !!block.format.toggleable)
  let prefix: React.ReactNode = null
  switch (block.type) {
    case 'bulleted_list':
      prefix = <span className="bullet">{listMarker(block, number, depth)}</span>
      break
    case 'numbered_list':
      prefix = <span className="bullet num">{listMarker(block, number, depth)}</span>
      break
    case 'to_do':
      prefix = (
        <input
          type="checkbox"
          className="todo-check"
          checked={!!block.properties.checked}
          disabled={locked}
          onChange={(e) => S().updateBlock(id, { properties: { checked: e.target.checked } })}
        />
      )
      break
    case 'toggle':
    case 'header':
    case 'sub_header':
    case 'sub_sub_header':
    case 'header_4':
      if (!isToggle) break
      prefix = (
        <button
          className={`toggle-arrow ${block.format.collapsed ? '' : 'open'}`}
          onClick={() => S().updateBlock(id, { format: { collapsed: !block.format.collapsed } })}
          aria-label={block.format.collapsed ? 'Open' : 'Close'}
        >
          <TriangleIcon />
        </button>
      )
      break
    case 'callout':
      prefix = (
        <button
          className="callout-icon"
          title="Change icon"
          onClick={(e) => setIconRect(e.currentTarget.getBoundingClientRect())}
        >
          {block.format.icon ?? '💡'}
        </button>
      )
      break
  }

  const showChildren = block.type !== 'page' && !NOT_EDITABLE.has(block.type) && block.content.length > 0 && !(isToggle && block.format.collapsed)

  return (
    <div
      ref={rowRef}
      className={`block-row type-${block.type} ${isToggle ? 'is-toggle' : ''} ${block.format.quote_size === 'large' ? 'quote-large' : ''} ${block.format.color ? `color-${block.format.color}` : ''} ${block.properties.checked ? 'checked' : ''} ${dropPos ? `drop-${dropPos}` : ''} ${selected ? 'selected' : ''}`}
      data-block-id={id}
      onDragOver={onDragOver}
      onDragLeave={() => setDropPos(null)}
      onDrop={onDrop}
    >
      <div className="block-main">
        <div className="block-controls" hidden={locked}>
          <button
            className="ctl"
            title={'Click to add below\nAlt-click to add above'}
            onClick={(e) => {
              const parent = S().blocks[id].parent_id!
              const next = e.altKey
                ? S().insertBlock({ parent, index: S().blocks[parent].content.indexOf(id) })
                : S().insertBlock({ after: id })
              S().requestFocus({ id: next, at: 'start' })
            }}
          >
            <PlusIcon />
          </button>
          <span
            className="ctl handle"
            draggable
            title={'Drag to move\nClick to open menu'}
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-block', id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <DragIcon />
          </span>
          {menuOpen && <BlockMenu id={id} onClose={() => setMenuOpen(false)} />}
        </div>

        {block.type === 'divider' ? (
          <hr className="divider" />
        ) : MEDIA.has(block.type) ? (
          <MediaBlock block={block} locked={locked} />
        ) : block.type === 'table' ? (
          <TableBlock block={block} locked={locked} />
        ) : block.type === 'table_of_contents' ? (
          <TableOfContents pageId={pageId} />
        ) : block.type === 'column_list' ? (
          <Columns block={block} pageId={pageId} locked={locked} />
        ) : block.type === 'page' && block.schema && block.format.inline ? (
          <InlineDatabase block={block} locked={locked} />
        ) : block.type === 'page' ? (
          <div className="page-link" onClick={() => S().openPage(id)}>
            <span>{block.format.icon ?? '📄'}</span>
            <span className="page-link-title">{pageTitle(block)}</span>
          </div>
        ) : (
          <div className="block-body">
            {prefix}
            {isCode ? (
              <div className="code-block">
                <div className="code-bar">
                  <select
                    value={block.format.code_language ?? 'plain text'}
                    disabled={locked}
                    onChange={(e) => S().updateBlock(id, { format: { code_language: e.target.value === 'plain text' ? undefined : e.target.value } })}
                  >
                    {CODE_LANGUAGES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  <button
                    className="btn-ghost small"
                    onClick={(e) => {
                      const b = e.currentTarget
                      navigator.clipboard.writeText(block.properties.title)
                      b.textContent = 'Copied!'
                      setTimeout(() => (b.textContent = 'Copy'), 1200)
                    }}
                  >
                    Copy
                  </button>
                </div>
                <pre className="code-wrap">{editable}</pre>
              </div>
            ) : (
              editable
            )}
          </div>
        )}
      </div>

      {aiOpen && (
        <AIInline
          blockId={id}
          pageId={pageId}
          selection={aiSelection}
          onClose={() => {
            setAiOpen(false)
            setAiSelection(undefined)
            S().requestFocus({ id, at: 'end' })
          }}
        />
      )}
      {slash && (
        <SlashMenu
          items={filterMenu(slash.query)}
          active={slash.active}
          anchor={slash.rect}
          onPick={(item) => S().transact(() => pick(item))}
          onHover={(i) => setSlash({ ...slash, active: i })}
        />
      )}
      {iconRect && <EmojiPicker anchor={iconRect} onClose={() => setIconRect(null)} onPick={(icon) => S().updateBlock(id, { format: { icon: icon ?? '💡' } })} />}
      {mention && (
        <SlashMenu
          items={mentionItems(mention.query, pageId)}
          active={mention.active}
          anchor={mention.rect}
          onPick={(item) => S().transact(() => pickMention(item))}
          onHover={(i) => setMention({ ...mention, active: i })}
        />
      )}
      {showChildren && (
        <div className="block-children">
          <BlockList ids={block.content} pageId={pageId} depth={depth + 1} />
        </div>
      )}
      {isToggle && !block.format.collapsed && !block.content.some((c) => S().blocks[c]?.alive) && (
        <div
          className="toggle-empty"
          onClick={() => {
            const c = S().insertBlock({ parent: id })
            S().requestFocus({ id: c, at: 'start' })
          }}
        >
          {block.type === 'toggle' ? 'Empty toggle. Click or drop blocks inside.' : 'Empty toggle heading. Click or drop blocks inside.'}
        </div>
      )}
    </div>
  )
}

/** A database shown right inside a page: its own title, then the table / board / … views. */
function InlineDatabase({ block, locked }: { block: Block; locked: boolean }) {
  return (
    <div className="inline-db">
      <div className="inline-db-head">
        <input
          className="inline-db-title"
          value={block.properties.title}
          placeholder="Untitled database"
          readOnly={locked}
          onChange={(e) => useStore.getState().updateBlock(block.id, { properties: { title: e.target.value } })}
        />
        <button className="btn-ghost small" title="Open as full page" onClick={() => useStore.getState().openPage(block.id)}>
          ⤢ Open
        </button>
      </div>
      <DatabaseView dbId={block.id} />
    </div>
  )
}

function BlockMenu({ id, onClose }: { id: string; onClose: () => void }) {
  const S = useStore.getState
  const isPage = S().blocks[id]?.type === 'page'
  const turnInto = isPage || NOT_EDITABLE.has(S().blocks[id]?.type) ? [] : MENU_ITEMS.filter((i) => !['ai', 'page', 'database'].includes(i.key) && !NOT_EDITABLE.has(i.key as BlockType) && !i.key.startsWith('columns_'))
  const color = S().blocks[id]?.format.color
  const setColor = (c: BlockColor | undefined) => {
    S().updateBlock(id, { format: { color: c } })
    onClose()
  }
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="popover block-menu">
        <div
          className="menu-item"
          onClick={() => {
            S().removeBlock(id)
            onClose()
          }}
        >
          🗑 Delete
        </div>
        <div
          className="menu-item"
          onClick={() => {
            S().duplicate(id)
            onClose()
          }}
        >
          ⧉ Duplicate
        </div>
        <div className="menu-section">Colour</div>
        <div className="menu-item" onClick={() => setColor(undefined)}>
          <span className="color-swatch">A</span> Default
        </div>
        {COLOR_NAMES.map((c) => (
          <div key={c} className={`menu-item ${color === c ? 'active' : ''}`} onClick={() => setColor(c)}>
            <span className="color-swatch" style={{ color: `var(--c-${c})` }}>A</span> {c[0].toUpperCase() + c.slice(1)} text
          </div>
        ))}
        {COLOR_NAMES.map((c) => (
          <div key={c} className={`menu-item ${color === `${c}_background` ? 'active' : ''}`} onClick={() => setColor(`${c}_background`)}>
            <span className="color-swatch" style={{ background: `var(--bg-${c})` }}>A</span> {c[0].toUpperCase() + c.slice(1)} background
          </div>
        ))}
        {!isPage && <div className="menu-section">Turn into</div>}
        {turnInto.map((i) => (
          <div
            key={i.key}
            className="menu-item"
            onClick={() => {
              S().setType(id, i.key as BlockType)
              onClose()
            }}
          >
            <span className="menu-icon">{i.icon}</span> {i.label}
          </div>
        ))}
      </div>
    </>
  )
}
