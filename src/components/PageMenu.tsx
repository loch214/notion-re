// "⋯" menu in the top bar, in Notion's current order: Search actions, Copy link, Copy page contents,
// Duplicate, Move to, Version history, Appearance & layout ▸ (font, Small text, Full width, Table of
// contents, plus our page background and cover), Use with AI ▸, Lock page, Move to Trash, More ▸,
// and a "Last edited" footer with the word count.

import { useEffect, useMemo, useRef, useState } from 'react'
import { askAI } from '../askAI'
import { getProfileName } from '../profile'
import { ActionMenu, EditedFooter, type MenuEntry } from './Menu'
import { importMarkdown } from './Sidebar'
import { COLOR_NAMES, COVER_PRESETS, pageToMarkdown } from '../../shared/blocks.ts'
import { pageUrl } from '../router'
import { pagePath, pageTitle, useStore } from '../store'
import type { PageFont } from '../types'

const FONTS: { font: PageFont; label: string; tip: string }[] = [
  { font: 'default', label: 'Default', tip: 'The default sans-serif workhorse' },
  { font: 'serif', label: 'Serif', tip: 'Good for publishing' },
  { font: 'mono', label: 'Mono', tip: 'Good for drafting and notes' },

]

/** Ctrl+L / "Copy link": the page's #/<id> address, with Notion's toast. */
export function copyPageLink(pageId: string) {
  navigator.clipboard.writeText(pageUrl(pageId)).then(
    () => useStore.getState().showToast({ label: 'Copied link to clipboard' }),
    () => useStore.getState().showToast({ label: 'Could not copy the link' }),
  )
}

/** Download the page as a Markdown file named after its title. */
export function exportMarkdown(pageId: string) {
  const S = useStore.getState()
  const md = pageToMarkdown(S.blocks, pageId)
  const name = (pageTitle(S.blocks[pageId]).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled') + '.md'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function toggleFavorite(pageId: string) {
  const S = useStore.getState()
  S.updateBlock(pageId, { format: { favorite: !S.blocks[pageId]?.format.favorite || undefined } })
}

export function PageMenu({ pageId, onClose, onHistory, onMove }: { pageId: string; onClose: () => void; onHistory: () => void; onMove: () => void }) {
  const page = useStore((s) => s.blocks[pageId])
  const S = useStore.getState
  if (!page) return null
  const f = page.format
  const font = f.page_font ?? 'default'
  const set = (format: Partial<typeof f>) => S().updateBlock(pageId, { format })
  const markdown = () => pageToMarkdown(S().blocks, pageId)
  const words = markdown().split(/\s+/).filter((w) => /\w/.test(w)).length

  const look = (
    <>
      <div className="amenu-section">Font style</div>
      <div className="font-picker">
        {FONTS.map((x) => (
          <button key={x.font} title={x.tip} className={`${font === x.font ? 'on' : ''} font-sample-${x.font}`} onClick={() => set({ page_font: x.font === 'default' ? undefined : x.font })}>
            <span className="font-ag">Ag</span>
            <span className="font-name">{x.label}</span>
          </button>
        ))}
      </div>
    </>
  )
  const colours = (
    <>
      <div className="amenu-section">Page background</div>
      <div className="swatches">
        <button className={!f.background ? 'on' : ''} title="None" style={{ background: 'var(--bg)' }} onClick={() => set({ background: undefined })} />
        {COLOR_NAMES.map((c) => (
          <button key={c} className={f.background === c ? 'on' : ''} title={c} style={{ background: `var(--bg-${c})` }} onClick={() => set({ background: c })} />
        ))}
      </div>
      <div className="amenu-section">Cover</div>
      <div className="swatches">
        <button className={!f.cover ? 'on' : ''} title="No cover" onClick={() => set({ cover: undefined })}>
          ✕
        </button>
        {Object.entries(COVER_PRESETS).map(([name, css]) => (
          <button key={name} className={f.cover === name || f.cover === css ? 'on' : ''} title={name} style={{ background: css }} onClick={() => set({ cover: name })} />
        ))}
      </div>
    </>
  )

  const entries: MenuEntry[] = [
    { label: 'Copy link', icon: 'link', kbd: 'Ctrl+L', onClick: () => copyPageLink(pageId) },
    {
      label: 'Copy page contents',
      icon: 'copy',
      onClick: () => navigator.clipboard.writeText(markdown()).then(() => S().showToast({ label: 'Copied page contents' })),
    },
    { label: 'Duplicate', icon: 'duplicate', kbd: 'Ctrl+D', onClick: () => S().openPage(S().duplicate(pageId)) },
    { label: 'Move to', icon: 'moveTo', kbd: 'Ctrl+Shift+P', onClick: onMove },
    { label: 'Version history', icon: 'history', keywords: 'undo restore', onClick: onHistory },
    { kind: 'sep' },
    {
      label: 'Appearance & layout',
      icon: 'text',
      keywords: 'font style',
      subWidth: 270,
      subNode: look,
      sub: [
        { kind: 'section', label: 'Appearance' },
        { label: 'Small text', icon: 'smallText', toggle: !!f.small_text, onClick: () => set({ small_text: !f.small_text || undefined }) },
        { label: 'Full width', icon: 'fullWidth', toggle: !!f.full_width, onClick: () => set({ full_width: !f.full_width || undefined }) },
        { label: 'Table of contents', icon: 'list', keywords: 'outline', toggle: !f.hide_outline, onClick: () => set({ hide_outline: !f.hide_outline || undefined }) },
        { kind: 'node', node: colours },
      ],
    },
    {
      label: 'Use with AI',
      icon: 'sparkle',
      sub: [
        { label: 'Summarize this page', icon: 'list', onClick: () => askAI('Summarize this page') },
        { label: 'Translate this page', icon: 'translate', onClick: () => askAI('Translate this page into English (if it is already English, ask me which language)') },
        { label: 'Make this page look nicer', icon: 'palette', onClick: () => askAI('Make this page look nicer: tidy the structure and add a little colour, an icon and a cover.') },
        { label: 'Ask about this page', icon: 'chat', onClick: () => askAI('') },
      ],
    },
    { kind: 'sep' },
    { label: 'Lock page', icon: f.locked ? 'lock' : 'unlock', toggle: !!f.locked, onClick: () => set({ locked: !f.locked || undefined }) },
    {
      label: 'Move to Trash',
      icon: 'trash',
      disabled: !!f.locked,
      title: f.locked ? 'Unlock this page to move it to Trash.' : undefined,
      onClick: () => S().removeBlock(pageId),
    },
    { kind: 'sep' },
    {
      label: 'More',
      icon: 'more',
      sub: [
        { label: f.favorite ? 'Remove from Favorites' : 'Add to Favorites', icon: 'star', onClick: () => toggleFavorite(pageId) },
        { label: 'Export as Markdown', icon: 'export', keywords: 'download', onClick: () => exportMarkdown(pageId) },
        { label: 'Import', icon: 'import', keywords: 'markdown', onClick: pickImport },
      ],
    },
  ]

  return (
    <ActionMenu
      className="page-menu"
      entries={entries}
      onClose={onClose}
      footer={<EditedFooter name={getProfileName()} time={page.last_edited_time} created={page.created_time} extra={`${words.toLocaleString()} word${words === 1 ? '' : 's'}`} />}
    />
  )
}

function pickImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,.markdown,.txt'
  input.multiple = true
  input.onchange = () => input.files?.length && importMarkdown(input.files)
  input.click()
}

/** "Move to" picker: search a page to move this one into, or back to the top level. */
export function MovePageModal({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const blocks = useStore((s) => s.blocks)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const targets = useMemo(() => {
    const query = q.trim().toLowerCase()
    const inside = (id: string) => {
      for (let b = blocks[id]; b; b = blocks[b.parent_id!]) if (b.id === pageId || !b.alive) return true
      return false
    }
    // Pages it can go into: alive, not itself or its sub-pages, not a database or a database row.
    const pages = Object.values(blocks).filter(
      (b) => b.type === 'page' && !b.schema && !blocks[b.parent_id!]?.schema && !inside(b.id) && pageTitle(b).toLowerCase().includes(query),
    )
    pages.sort((a, b) => b.last_edited_time - a.last_edited_time)
    const top = !query || 'private'.includes(query) ? [null] : []
    return [...top, ...pages.slice(0, 50).map((p) => p.id)]
  }, [q, blocks, pageId])

  const go = (target: string | null) => {
    useStore.getState().movePage(pageId, target)
    const where = target ? pageTitle(blocks[target]) : 'Private'
    useStore.getState().showToast({ label: `Moved to ${where}`, action: { label: 'Undo', run: () => useStore.getState().undo() } })
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const current = blocks[pageId]?.parent_id ?? null
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Move page to…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, targets.length - 1))
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            if (e.key === 'Enter' && active < targets.length) go(targets[active])
          }}
        />
        <div className="search-results">
          {targets.length === 0 && <div className="menu-empty">No results</div>}
          {targets.map((t, i) => (
            <div
              key={t ?? 'top'}
              className={`menu-item ${i === active ? 'active' : ''} ${t === current ? 'disabled' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => t !== current && go(t)}
            >
              <span className="menu-icon">{t ? blocks[t].format.icon ?? '📄' : '🔒'}</span>
              <span>
                <div className="menu-label">{t ? pageTitle(blocks[t]) : 'Private'}</div>
                <div className="menu-hint">
                  {t
                    ? pagePath(blocks, t).slice(0, -1).map((p) => pageTitle(p)).join(' / ')
                    : 'Top level of the sidebar'}
                  {t === current && ' · current location'}
                </div>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
