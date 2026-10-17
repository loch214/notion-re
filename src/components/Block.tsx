import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
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
import { COLOR_NAMES } from '../../shared/blocks.ts'
import { pageTitle, useStore, visibleOrder } from '../store'
import type { Block, BlockColor, BlockType } from '../types'
import { AIInline } from './AIInline'
import { filterMenu, MENU_ITEMS, SlashMenu, type MenuItem } from './SlashMenu'

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  header: 'Heading 1',
  sub_header: 'Heading 2',
  sub_sub_header: 'Heading 3',
  bulleted_list: 'List',
  numbered_list: 'List',
  to_do: 'To-do',
  toggle: 'Toggle',
  quote: 'Quote',
  callout: 'Callout',
  code: 'Code',
}

/** Types that keep their type when you press Enter (Notion behaviour). */
const CONTINUES = new Set<BlockType>(['bulleted_list', 'numbered_list', 'to_do', 'toggle'])
const NOT_EDITABLE = new Set<BlockType>(['divider', 'page'])

/** Markdown shortcuts triggered by typing the prefix then Space. */
const SHORTCUTS: Record<string, BlockType> = {
  '#': 'header',
  '##': 'sub_header',
  '###': 'sub_sub_header',
  '-': 'bulleted_list',
  '*': 'bulleted_list',
  '+': 'bulleted_list',
  '1.': 'numbered_list',
  '[]': 'to_do',
  '>': 'toggle',
  '"': 'quote',
}

const CALLOUT_ICONS = ['💡', '⚠️', '📌', '✅', '❗', '🔥', 'ℹ️', '📝']

export function BlockList({ ids, pageId }: { ids: string[]; pageId: string }) {
  const blocks = useStore((s) => s.blocks)
  let n = 0
  return (
    <>
      {ids.map((id) => {
        const b = blocks[id]
        if (!b?.alive) return null
        n = b.type === 'numbered_list' ? n + 1 : 0
        return <BlockView key={id} id={id} pageId={pageId} number={n} />
      })}
    </>
  )
}

interface SlashState {
  start: number
  query: string
  active: number
  rect: DOMRect
}

function BlockView({ id, pageId, number }: { id: string; pageId: string; number: number }) {
  const block = useStore((s) => s.blocks[id]) as Block
  const focus = useStore((s) => s.focus)
  const ref = useRef<HTMLDivElement>(null)
  const localHtml = useRef<string | null>(null)
  const pendingSlash = useRef<number | null>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
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

  const onInput = () => {
    const el = ref.current!
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
    const type = item.key
    let target = id
    if (empty) setType(id, type)
    else target = insertBlock({ after: id, type })
    if (type === 'divider') {
      const next = insertBlock({ after: target })
      requestFocus({ id: next, at: 'start' })
    } else requestFocus({ id: target, at: 'end' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current!
    const store = S()

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
      const type = SHORTCUTS[before]
      if (type && type !== block.type) {
        e.preventDefault()
        deleteTextRange(el, 0, offset)
        save()
        store.setType(id, type)
        store.requestFocus({ id, at: 'start' })
        return
      }
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
        store.setType(id, 'text')
        return
      }
      const [before, after] = splitAtCaret(el)
      const cleanBefore = sanitizeHtml(before)
      store.updateBlock(id, { properties: { title: cleanBefore } })
      const type = CONTINUES.has(block.type) ? block.type : 'text'
      const hasOpenChildren = block.content.some((c) => store.blocks[c]?.alive) && !(block.type === 'toggle' && block.format.collapsed)
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
    if (e.key === 'Escape') el.blur()
  }

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
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
      contentEditable={isCode ? 'plaintext-only' : true}
      suppressContentEditableWarning
      spellCheck={!isCode}
      data-placeholder={PLACEHOLDER[block.type] ?? "Type '/' for commands, or space for AI…"}
      // One key press / input = at most one undo step, even when it does several edits.
      onInput={() => S().transact(onInput)}
      onKeyDown={(e) => S().transact(() => onKeyDown(e))}
      onPaste={onPaste}
      onBlur={() => setTimeout(() => setSlash(null), 150)}
    />
  )

  let prefix: React.ReactNode = null
  switch (block.type) {
    case 'bulleted_list':
      prefix = <span className="bullet">•</span>
      break
    case 'numbered_list':
      prefix = <span className="bullet num">{number}.</span>
      break
    case 'to_do':
      prefix = (
        <input
          type="checkbox"
          className="todo-check"
          checked={!!block.properties.checked}
          onChange={(e) => S().updateBlock(id, { properties: { checked: e.target.checked } })}
        />
      )
      break
    case 'toggle':
      prefix = (
        <button
          className={`toggle-arrow ${block.format.collapsed ? '' : 'open'}`}
          onClick={() => S().updateBlock(id, { format: { collapsed: !block.format.collapsed } })}
          aria-label="Toggle"
        >
          ▶
        </button>
      )
      break
    case 'callout':
      prefix = (
        <button
          className="callout-icon"
          title="Change icon"
          onClick={() => {
            const i = CALLOUT_ICONS.indexOf(block.format.icon ?? '')
            S().updateBlock(id, { format: { icon: CALLOUT_ICONS[(i + 1) % CALLOUT_ICONS.length] } })
          }}
        >
          {block.format.icon ?? '💡'}
        </button>
      )
      break
  }

  const showChildren =
    block.type !== 'page' && block.content.length > 0 && !(block.type === 'toggle' && block.format.collapsed)

  return (
    <div
      className={`block-row type-${block.type} ${block.format.color ? `color-${block.format.color}` : ''} ${block.properties.checked ? 'checked' : ''} ${dropPos ? `drop-${dropPos}` : ''}`}
      data-block-id={id}
      onDragOver={onDragOver}
      onDragLeave={() => setDropPos(null)}
      onDrop={onDrop}
    >
      <div className="block-main">
        <div className="block-controls">
          <button
            className="ctl"
            title="Add block below"
            onClick={() => {
              const next = S().insertBlock({ after: id })
              S().requestFocus({ id: next, at: 'start' })
            }}
          >
            +
          </button>
          <span
            className="ctl handle"
            draggable
            title="Drag to move · click for options"
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-block', id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋮⋮
          </span>
          {menuOpen && <BlockMenu id={id} onClose={() => setMenuOpen(false)} />}
        </div>

        {block.type === 'divider' ? (
          <hr className="divider" />
        ) : block.type === 'page' ? (
          <div className="page-link" onClick={() => S().openPage(id)}>
            <span>{block.format.icon ?? '📄'}</span>
            <span className="page-link-title">{pageTitle(block)}</span>
          </div>
        ) : (
          <div className="block-body">
            {prefix}
            {isCode ? <pre className="code-wrap">{editable}</pre> : editable}
          </div>
        )}
      </div>

      {aiOpen && <AIInline blockId={id} pageId={pageId} onClose={() => { setAiOpen(false); S().requestFocus({ id, at: 'end' }) }} />}
      {slash && (
        <SlashMenu
          items={filterMenu(slash.query)}
          active={slash.active}
          anchor={slash.rect}
          onPick={(item) => S().transact(() => pick(item))}
          onHover={(i) => setSlash({ ...slash, active: i })}
        />
      )}
      {showChildren && (
        <div className="block-children">
          <BlockList ids={block.content} pageId={pageId} />
        </div>
      )}
      {block.type === 'toggle' && !block.format.collapsed && block.content.length === 0 && (
        <div
          className="toggle-empty"
          onClick={() => {
            const c = S().insertBlock({ parent: id })
            S().requestFocus({ id: c, at: 'start' })
          }}
        >
          Empty toggle. Click to add a block inside.
        </div>
      )}
    </div>
  )
}

function BlockMenu({ id, onClose }: { id: string; onClose: () => void }) {
  const S = useStore.getState
  const isPage = S().blocks[id]?.type === 'page'
  const turnInto = isPage ? [] : MENU_ITEMS.filter((i) => i.key !== 'ai' && i.key !== 'page' && i.key !== 'database')
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
