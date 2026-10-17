import { useEffect, useRef } from 'react'
import { COVER_PRESETS, coverCss } from '../../shared/blocks.ts'
import { useStore } from '../store'
import { BlockList } from './Block'
import { DatabaseView, RowProperties } from './Database'

const ICONS = ['📄', '📝', '📚', '🎯', '💡', '🚀', '📅', '✅', '🧠', '🎨', '💼', '🏠', '🌱', '⭐', '🔥', '🎓']
const COVERS = Object.keys(COVER_PRESETS)

export function PageView({ pageId }: { pageId: string }) {
  const page = useStore((s) => s.blocks[pageId])
  const isRow = useStore((s) => !!(page?.parent_id && s.blocks[page.parent_id]?.schema))
  const titleRef = useRef<HTMLDivElement>(null)

  // Title is plain text; only write to the DOM when switching pages.
  useEffect(() => {
    if (titleRef.current) titleRef.current.textContent = page?.properties.title ?? ''
    if (titleRef.current && !page?.properties.title) titleRef.current.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  if (!page) return null
  const S = useStore.getState
  const alive = page.content.filter((c) => S().blocks[c]?.alive)
  const isDb = !!page.schema
  const cover = coverCss(page.format.cover)
  const f = page.format

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
    <div className={`page ${f.background ? `bg-${f.background}` : ''} ${f.page_font && f.page_font !== 'default' ? `font-${f.page_font}` : ''}`}>
      {cover && (
        <div className="cover" style={{ background: cover }}>
          <div className="cover-actions">
            <button
              className="btn small"
              onClick={() => {
                // Older pages stored the gradient itself rather than the preset name.
                const name = COVERS.find((k) => k === page.format.cover || COVER_PRESETS[k] === page.format.cover)
                const i = name ? COVERS.indexOf(name) : -1
                S().updateBlock(pageId, { format: { cover: COVERS[(i + 1) % COVERS.length] } })
              }}
            >
              Change cover
            </button>
            <button className="btn small" onClick={() => S().updateBlock(pageId, { format: { cover: undefined } })}>
              Remove
            </button>
          </div>
        </div>
      )}
      <div className={`page-inner ${cover ? 'has-cover' : ''} ${isDb ? 'is-db' : ''} ${f.full_width ? 'full-width' : ''}`}>
        {page.format.icon && (
          <button
            className="page-icon"
            title="Change icon (right-click to remove)"
            onClick={() => {
              const i = ICONS.indexOf(page.format.icon!)
              S().updateBlock(pageId, { format: { icon: ICONS[(i + 1) % ICONS.length] } })
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              S().updateBlock(pageId, { format: { icon: undefined } })
            }}
          >
            {page.format.icon}
          </button>
        )}
        <div className="page-meta-actions">
          {!page.format.icon && (
            <button className="btn-ghost" onClick={() => S().updateBlock(pageId, { format: { icon: ICONS[Math.floor(Math.random() * ICONS.length)] } })}>
              ☺ Add icon
            </button>
          )}
          {!cover && (
            <button className="btn-ghost" onClick={() => S().updateBlock(pageId, { format: { cover: COVERS[Math.floor(Math.random() * COVERS.length)] } })}>
              🖼 Add cover
            </button>
          )}
        </div>
        <div
          ref={titleRef}
          className="page-title"
          contentEditable="plaintext-only"
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
        {isRow && <RowProperties rowId={pageId} />}
        {isDb ? (
          <DatabaseView dbId={pageId} />
        ) : (
          <>
            <div className="blocks">
              <BlockList ids={page.content} pageId={pageId} />
            </div>
            <div className="page-tail" onClick={addBlockAtEnd} />
          </>
        )}
      </div>
    </div>
  )
}
