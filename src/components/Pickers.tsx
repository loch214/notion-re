import { useState } from 'react'
import { COVER_PRESETS, coverCss } from '../../shared/blocks.ts'
import { EMOJI_GROUPS, randomEmoji, searchEmoji } from '../emoji'
import { Popover } from './Database'

/** Icon picker: search box, every group of emoji, "Random" and "Remove". */
export function EmojiPicker({ anchor, onPick, onClose }: { anchor: DOMRect; onPick: (emoji: string | undefined) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const found = q.trim() ? searchEmoji(q) : null
  const choose = (e: string | undefined) => {
    onPick(e)
    onClose()
  }
  return (
    <Popover anchor={anchor} onClose={onClose} width={340}>
      <div className="picker-top">
        <input autoFocus className="input" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" onClick={() => choose(randomEmoji())}>🎲</button>
        <button className="btn small" onClick={() => choose(undefined)}>Remove</button>
      </div>
      <div className="emoji-scroll">
        {found ? (
          found.length ? (
            <div className="emoji-grid">
              {found.map((e) => (
                <button key={e.char} className="emoji-btn" title={e.words} onClick={() => choose(e.char)}>{e.char}</button>
              ))}
            </div>
          ) : (
            <div className="menu-empty">No results</div>
          )
        ) : (
          EMOJI_GROUPS.map((g) => (
            <div key={g.name}>
              <div className="menu-section">{g.name}</div>
              <div className="emoji-grid">
                {g.items.map((e) => (
                  <button key={e.char} className="emoji-btn" title={e.words} onClick={() => choose(e.char)}>{e.char}</button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Popover>
  )
}

const SOLIDS = ['#e9e5e3', '#f3eeee', '#f5e0e9', '#fadec9', '#fdecc8', '#dbeddb', '#d3e5ef', '#e8deee', '#ffd1d1', '#37352f']

/** Cover picker: gradient presets, plain colours, or an https image link. */
export function CoverPicker({ anchor, current, onPick, onClose }: { anchor: DOMRect; current?: string; onPick: (cover: string | undefined) => void; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const choose = (c: string | undefined) => {
    onPick(c)
    onClose()
  }
  const urlOk = /^https:\/\/\S+$/.test(url.trim()) && !!coverCss(url.trim())
  return (
    <Popover anchor={anchor} onClose={onClose} width={340}>
      <div className="menu-section">Gradients</div>
      <div className="cover-grid">
        {Object.keys(COVER_PRESETS).map((k) => (
          <button key={k} className={`cover-swatch ${current === k ? 'active' : ''}`} title={k} style={{ background: COVER_PRESETS[k] }} onClick={() => choose(k)} />
        ))}
      </div>
      <div className="menu-section">Colours</div>
      <div className="cover-grid">
        {SOLIDS.map((c) => (
          <button key={c} className={`cover-swatch ${current === c ? 'active' : ''}`} style={{ background: c }} onClick={() => choose(c)} />
        ))}
      </div>
      <div className="menu-section">Image link</div>
      <div className="picker-top">
        <input
          className="input"
          placeholder="Paste an https image link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && urlOk && choose(url.trim())}
        />
        <button className="btn small" disabled={!urlOk} onClick={() => choose(url.trim())}>Set</button>
      </div>
      <div className="picker-top">
        <button className="btn small danger" onClick={() => choose(undefined)}>Remove cover</button>
      </div>
    </Popover>
  )
}
