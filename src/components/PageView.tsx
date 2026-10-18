import { useEffect, useRef, useState } from 'react'
import { COVER_PRESETS, coverCss } from '../../shared/blocks.ts'
import { pageTitle, useStore } from '../store'
import type { Block } from '../types'
import { BlockList } from './Block'
import { CoverPicker, EmojiPicker } from './Pickers'
import { BlockSelection } from './BlockSelection'
import { RowProperties } from './Database'
import { DatabaseView } from './DatabaseViews'

const COVERS = Object.keys(COVER_PRESETS)

/** Pages that link to `pageId` (a link in any of their blocks), as a comma-separated id list. */
function backlinkIds(blocks: Record<string, Block>, pageId: string): string {
  const needle = `href="#/${pageId}"`
  const out = new Set<string>()
  for (const b of Object.values(blocks)) {
    if (!b.alive || !b.properties.title?.includes(needle)) continue
    let p: Block | undefined = b
    while (p && !(p.type === 'page' && p.id !== b.id) && p.parent_id) p = blocks[p.parent_id]
    const page = b.type === 'page' ? b : p
    if (page && page.id !== pageId) out.add(page.id)
  }
  return [...out].join(',')
}

export function PageView({ pageId }: { pageId: string }) {
  const page = useStore((s) => s.blocks[pageId])
  const isRow = useStore((s) => !!(page?.parent_id && s.blocks[page.parent_id]?.schema))
  const titleRef = useRef<HTMLDivElement>(null)
  const backlinks = useStore((s) => backlinkIds(s.blocks, pageId)).split(',').filter(Boolean)
  const [showBack, setShowBack] = useState(false)
  const [picker, setPicker] = useState<{ kind: 'icon' | 'cover'; rect: DOMRect } | null>(null)

  // Title is plain text; only write to the DOM when switching pages.
  useEffect(() => {
    if (titleRef.current) titleRef.current.textContent = page?.properties.title ?? ''
    if (titleRef.current && !page?.properties.title) titleRef.current.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  // Title changed from outside (undo, AI, another tab) while you're not typing in it.
  useEffect(() => {
    const el = titleRef.current
    if (el && document.activeElement !== el && el.textContent !== (page?.properties.title ?? '')) el.textContent = page?.properties.title ?? ''
  }, [page?.properties.title])

  if (!page) return null
  const S = useStore.getState
  const alive = page.content.filter((c) => S().blocks[c]?.alive)
  const isDb = !!page.schema
  const cover = coverCss(page.format.cover)
  const f = page.format
  const locked = !!f.locked

  const addBlockAtEnd = () => {
    const last = alive[alive.length - 1]
    const lastBlock = last ? S().blocks[last] : undefined
    // Reuse a trailing empty text block instead of piling up blank lines.
    if (lastBlock && lastBlock.type === 'text' && !lastBlock.properties.title) {
      S().requestFocus({ id: last, at: 'start' })
      return
    }
    const id = S().insertBlock({ parent: pageId })
    S().requestFocus({ id, at: 'start' })
  }

  return (
    <div className={`page ${f.background ? `bg-${f.background}` : ''} ${f.page_font && f.page_font !== 'default' ? `font-${f.page_font}` : ''} ${f.small_text ? 'small-text' : ''} ${locked ? 'locked' : ''}`}>
      {cover && (
        <div className="cover" style={{ background: cover }}>
          <div className="cover-actions" hidden={locked}>
            <button
              className="btn small"
              onClick={(e) => setPicker({ kind: 'cover', rect: e.currentTarget.getBoundingClientRect() })}
            >
              Change cover
            </button>
            <button className="btn small" onClick={() => S().updateBlock(pageId, { format: { cover: undefined } })}>
              Remove
            </button>
          </div>
        </div>
      )}
      {picker?.kind === 'icon' && (
        <EmojiPicker anchor={picker.rect} onClose={() => setPicker(null)} onPick={(icon) => S().updateBlock(pageId, { format: { icon } })} />
      )}
      {picker?.kind === 'cover' && (
        <CoverPicker anchor={picker.rect} current={page.format.cover} onClose={() => setPicker(null)} onPick={(c) => S().updateBlock(pageId, { format: { cover: c } })} />
      )}
      <div className={`page-inner ${cover ? 'has-cover' : ''} ${isDb ? 'is-db' : ''} ${f.full_width ? 'full-width' : ''}`}>
        {page.format.icon && (
          <button
            className="page-icon"
            title="Change icon (right-click to remove)"
            disabled={locked}
            onClick={(e) => setPicker({ kind: 'icon', rect: e.currentTarget.getBoundingClientRect() })}
            onContextMenu={(e) => {
              e.preventDefault()
              S().updateBlock(pageId, { format: { icon: undefined } })
            }}
          >
            {page.format.icon}
          </button>
        )}
        <div className="page-meta-actions" hidden={locked}>
          {!page.format.icon && (
            <button className="btn-ghost" onClick={(e) => setPicker({ kind: 'icon', rect: e.currentTarget.getBoundingClientRect() })}>
              ☺ Add icon
            </button>
          )}
          {!cover && (
            <button className="btn-ghost" onClick={() => S().updateBlock(pageId, { format: { cover: COVERS[Math.floor(Math.random() * COVERS.length)] } })} onContextMenu={(e) => { e.preventDefault(); setPicker({ kind: 'cover', rect: e.currentTarget.getBoundingClientRect() }) }}>
              🖼 Add cover
            </button>
          )}
        </div>
        <div
          ref={titleRef}
          className="page-title"
          contentEditable={locked ? false : 'plaintext-only'}
          suppressContentEditableWarning
          data-placeholder="Untitled"
          onInput={(e) => S().updateBlock(pageId, { properties: { title: e.currentTarget.textContent ?? '' } })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault()
              // A database page's children are its rows, not text blocks.
              if (isDb) return e.currentTarget.blur()
              const first = alive[0]
              const fb = first ? S().blocks[first] : undefined
              if (e.key === 'Enter' || !fb || fb.type === 'page' || fb.type === 'divider') {
                const id = S().insertBlock({ parent: pageId, index: 0 })
                S().requestFocus({ id, at: 'start' })
              } else S().requestFocus({ id: first, at: 'start' })
            }
          }}
        />
        {backlinks.length > 0 && (
          <div className="backlinks">
            <button className="btn-ghost small" onClick={() => setShowBack(!showBack)}>
              ↩ {backlinks.length} backlink{backlinks.length > 1 ? 's' : ''}
            </button>
            {showBack &&
              backlinks.map((id) => (
                <div key={id} className="backlink-item" onClick={() => S().openPage(id)}>
                  {S().blocks[id].format.icon ?? '📄'} {pageTitle(S().blocks[id])}
                </div>
              ))}
          </div>
        )}
        {isRow && <RowProperties rowId={pageId} />}
        {isDb ? (
          <DatabaseView dbId={pageId} />
        ) : (
          <>
            <BlockSelection pageId={pageId} />
            <div className="blocks">
              <BlockList ids={page.content} pageId={pageId} />
            </div>
            <div className="page-tail" onClick={locked ? undefined : addBlockAtEnd} />
          </>
        )}
      </div>
    </div>
  )
}
