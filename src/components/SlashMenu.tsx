import { useEffect, useRef } from 'react'
import type { BlockType } from '../types'

export interface MenuItem {
  key: BlockType | 'ai' | 'database' | `columns_${number}`
  section?: string
  label: string
  hint: string
  icon: string
  aliases: string[]
}

export const MENU_ITEMS: MenuItem[] = [
  { key: 'ai', label: 'Ask AI', hint: 'Write or brainstorm with your AI', icon: '✨', aliases: ['ai', 'write', 'generate'] },
  { key: 'text', label: 'Text', hint: 'Just start writing with plain text', icon: 'Aa', aliases: ['paragraph', 'plain'] },
  { key: 'page', label: 'Page', hint: 'Embed a sub-page inside this page', icon: '📄', aliases: ['subpage', 'doc'] },
  { key: 'database', label: 'Database', hint: 'Table of pages with properties', icon: '▦', aliases: ['table', 'db', 'collection'] },
  { key: 'header', label: 'Heading 1', hint: 'Big section heading', icon: 'H1', aliases: ['h1', 'title'] },
  { key: 'sub_header', label: 'Heading 2', hint: 'Medium section heading', icon: 'H2', aliases: ['h2', 'subtitle'] },
  { key: 'sub_sub_header', label: 'Heading 3', hint: 'Small section heading', icon: 'H3', aliases: ['h3'] },
  { key: 'header_4', label: 'Heading 4', hint: 'Smaller section heading', icon: 'H4', aliases: ['h4'] },
  { key: 'bulleted_list', label: 'Bulleted list', hint: 'Create a simple bulleted list', icon: '•', aliases: ['bullet', 'ul', 'list'] },
  { key: 'numbered_list', label: 'Numbered list', hint: 'Create a list with numbering', icon: '1.', aliases: ['ol', 'number'] },
  { key: 'to_do', label: 'To-do list', hint: 'Track tasks with a to-do list', icon: '☑', aliases: ['todo', 'task', 'check'] },
  { key: 'toggle', label: 'Toggle list', hint: 'Toggles can hide and show content', icon: '▸', aliases: ['collapse', 'details'] },
  { key: 'quote', label: 'Quote', hint: 'Capture a quote', icon: '❝', aliases: ['blockquote'] },
  { key: 'callout', label: 'Callout', hint: 'Make writing stand out', icon: '💡', aliases: ['note', 'info', 'tip'] },
  { key: 'code', label: 'Code', hint: 'Capture a code snippet', icon: '</>', aliases: ['snippet', 'pre'] },
  { key: 'divider', label: 'Divider', hint: 'Visually divide blocks', icon: '—', aliases: ['hr', 'line', 'separator'] },
  { key: 'table', label: 'Table', hint: 'Add a simple table', icon: '⊞', aliases: ['grid', 'simple'] },
  { key: 'table_of_contents', label: 'Table of contents', hint: 'Show an outline of the page', icon: '☰', aliases: ['toc', 'outline'] },
  { key: 'columns_2', label: '2 columns', hint: 'Create 2 columns of blocks', icon: '⫼', aliases: ['columns', 'layout'] },
  { key: 'columns_3', label: '3 columns', hint: 'Create 3 columns of blocks', icon: '⫼', aliases: ['columns', 'layout'] },
  { key: 'columns_4', label: '4 columns', hint: 'Create 4 columns of blocks', icon: '⫼', aliases: ['columns', 'layout'] },
  { key: 'image', label: 'Image', hint: 'Upload or embed with a link', icon: '🖼', aliases: ['picture', 'photo', 'img'], section: 'Media' },
  { key: 'video', label: 'Video', hint: 'Embed from YouTube, Vimeo…', icon: '🎬', aliases: ['youtube', 'movie'], section: 'Media' },
  { key: 'bookmark', label: 'Web bookmark', hint: 'Save a link as a visual bookmark', icon: '🔖', aliases: ['link', 'url'], section: 'Media' },
  { key: 'embed', label: 'Embed', hint: 'Embed any web page', icon: '🔗', aliases: ['iframe', 'website'], section: 'Media' },
]

export function filterMenu(query: string) {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return MENU_ITEMS
  return MENU_ITEMS.filter(
    (i) => i.label.toLowerCase().replace(/\s+/g, '').includes(q) || i.aliases.some((a) => a.startsWith(q)),
  )
}

interface Props {
  items: MenuItem[]
  active: number
  anchor: DOMRect
  onPick: (item: MenuItem) => void
  onHover: (i: number) => void
}

export function SlashMenu({ items, active, anchor, onPick, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector('.menu-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // Flip above the caret when there isn't room below.
  const below = window.innerHeight - anchor.bottom > 320
  const style = below
    ? { top: anchor.bottom + 6, left: anchor.left }
    : { bottom: window.innerHeight - anchor.top + 6, left: anchor.left }

  return (
    <div className="popover slash-menu" style={style} ref={ref} onMouseDown={(e) => e.preventDefault()}>
      {items.length === 0 ? (
        <div className="menu-empty">No results</div>
      ) : (
        <>
          {items.map((item, i) => [
            (i === 0 || items[i - 1].section !== item.section) && (
              <div key={`s-${item.key}`} className="menu-section">{item.section ?? 'Basic blocks'}</div>
            ),
            <div
              key={item.key}
              className={`menu-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(item)}
            >
              <span className="menu-icon">{item.icon}</span>
              <span>
                <div className="menu-label">{item.label}</div>
                <div className="menu-hint">{item.hint}</div>
              </span>
            </div>,
          ])}
        </>
      )}
    </div>
  )
}
