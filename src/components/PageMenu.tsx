// "⋯" menu in the top bar: how the current page looks (font, width, background, cover).

import { COLOR_NAMES, COVER_PRESETS } from '../../shared/blocks.ts'
import { useStore } from '../store'
import type { PageFont } from '../types'

const FONTS: { font: PageFont; label: string }[] = [
  { font: 'default', label: 'Default' },
  { font: 'serif', label: 'Serif' },
  { font: 'mono', label: 'Mono' },
]

export function PageMenu({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const page = useStore((s) => s.blocks[pageId])
  const S = useStore.getState
  if (!page) return null
  const f = page.format
  const font = f.page_font ?? 'default'

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="popover page-menu">
        <div className="menu-section">Font</div>
        <div className="seg">
          {FONTS.map((x) => (
            <button
              key={x.font}
              className={`${font === x.font ? 'on' : ''} font-sample-${x.font}`}
              onClick={() => S().updateBlock(pageId, { format: { page_font: x.font === 'default' ? undefined : x.font } })}
            >
              {x.label}
            </button>
          ))}
        </div>
        <label className="menu-item">
          <input type="checkbox" checked={!!f.full_width} onChange={(e) => S().updateBlock(pageId, { format: { full_width: e.target.checked || undefined } })} />
          Full width
        </label>

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

        <div className="menu-section">Page</div>
        <div
          className="menu-item"
          onClick={() => {
            S().openPage(S().duplicate(pageId))
            onClose()
          }}
        >
          ⧉ Duplicate page
        </div>
      </div>
    </>
  )
}
