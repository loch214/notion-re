// "⋯" menu in the top bar, in Notion's order: font, Small text / Full width, Lock page, look
// (background, cover), then page actions (Favorites, Copy link, Duplicate, Move to, Trash,
// Version history, Export).

import { useEffect, useMemo, useRef, useState } from 'react'
import { COLOR_NAMES, COVER_PRESETS, pageToMarkdown } from '../../shared/blocks.ts'
import { pageUrl } from '../router'
import { pagePath, pageTitle, useStore } from '../store'
import type { PageFont } from '../types'

const FONTS: { font: PageFont; label: string; tip: string }[] = [
  { font: 'default', label: 'Default', tip: 'The default sans-serif workhorse' },
  { font: 'serif', label: 'Serif', tip: 'Good for publishing' },
  { font: 'mono', label: 'Mono', tip: 'Good for drafting and notes' },
  { font: 'comic', label: 'Comic', tip: 'Playful but cringe' },
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
  const act = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="popover page-menu">
        <div className="menu-section">Style</div>
        <div className="font-picker">
          {FONTS.map((x) => (
            <button
              key={x.font}
              title={x.tip}
              className={`${font === x.font ? 'on' : ''} font-sample-${x.font}`}
              onClick={() => S().updateBlock(pageId, { format: { page_font: x.font === 'default' ? undefined : x.font } })}
            >
              <span className="font-ag">Ag</span>
              <span className="font-name">{x.label}</span>
            </button>
          ))}
        </div>
        <Switch label="Small text" on={!!f.small_text} set={(v) => S().updateBlock(pageId, { format: { small_text: v || undefined } })} />
        <Switch label="Full width" on={!!f.full_width} set={(v) => S().updateBlock(pageId, { format: { full_width: v || undefined } })} />
        <div className="menu-sep" />
        <Switch label="Lock page" on={!!f.locked} set={(v) => S().updateBlock(pageId, { format: { locked: v || undefined } })} />

        <div className="menu-section">Page background</div>
        <div className="swatches">
          <button className={!f.background ? 'on' : ''} title="None" style={{ background: 'var(--bg)' }} onClick={() => S().updateBlock(pageId, { format: { background: undefined } })} />
          {COLOR_NAMES.map((c) => (
            <button
              key={c}
              className={f.background === c ? 'on' : ''}
              title={c}
              style={{ background: `var(--bg-${c})` }}
              onClick={() => S().updateBlock(pageId, { format: { background: c } })}
            />
          ))}
        </div>

        <div className="menu-section">Cover</div>
        <div className="swatches">
          <button className={!f.cover ? 'on' : ''} title="No cover" onClick={() => S().updateBlock(pageId, { format: { cover: undefined } })}>
            ✕
          </button>
          {Object.entries(COVER_PRESETS).map(([name, css]) => (
            <button
              key={name}
              className={f.cover === name || f.cover === css ? 'on' : ''}
              title={name}
              style={{ background: css }}
              onClick={() => S().updateBlock(pageId, { format: { cover: name } })}
            />
          ))}
        </div>

        <div className="menu-sep" />
        <div className="menu-item" onClick={act(() => toggleFavorite(pageId))}>
          <span className="menu-icon">{f.favorite ? '★' : '☆'}</span> {f.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
        </div>
        <div className="menu-item" onClick={act(() => copyPageLink(pageId))}>
          <span className="menu-icon">🔗</span> Copy link <kbd>Ctrl+L</kbd>
        </div>
        <div className="menu-item" onClick={act(() => S().openPage(S().duplicate(pageId)))}>
          <span className="menu-icon">⧉</span> Duplicate
        </div>
        <div className="menu-item" onClick={act(onMove)}>
          <span className="menu-icon">↪</span> Move to <kbd>Ctrl+Shift+P</kbd>
        </div>
        <div
          className={`menu-item ${f.locked ? 'disabled' : ''}`}
          title={f.locked ? 'Unlock this page to move it to Trash.' : undefined}
          onClick={f.locked ? undefined : act(() => S().removeBlock(pageId))}
        >
          <span className="menu-icon">🗑</span> Move to Trash
        </div>
        <div className="menu-sep" />
        <div className="menu-item" onClick={act(onHistory)}>
          <span className="menu-icon">🕘</span> Version history
        </div>
        <div className="menu-item" onClick={act(() => exportMarkdown(pageId))}>
          <span className="menu-icon">⤓</span> Export as Markdown
        </div>
      </div>
    </>
  )
}

function Switch({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="menu-item switch-row" role="switch" aria-checked={on} onClick={() => set(!on)}>
      <span>{label}</span>
      <span className={`switch ${on ? 'on' : ''}`} />
    </div>
  )
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
