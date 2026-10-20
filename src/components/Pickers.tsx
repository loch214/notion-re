import { useState } from 'react'
import { COVER_PRESETS, coverCss } from '../../shared/blocks.ts'
import { EMOJI_GROUPS, randomEmoji, searchEmoji } from '../emoji'
import { Popover } from './Database'

const RECENT_KEY = 'notion-re:recent-emoji'
const recentEmoji = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** The tab row on top of Notion's pickers: tabs on the left, "Remove" on the right. */
function PickerTabs<T extends string>({ tabs, tab, onTab, onRemove }: { tabs: T[]; tab: T; onTab: (t: T) => void; onRemove: () => void }) {
  return (
    <div className="picker-tabs">
      {tabs.map((t) => (
        <button key={t} className={`picker-tab ${t === tab ? 'on' : ''}`} onClick={() => onTab(t)}>{t}</button>
      ))}
      <span style={{ flex: 1 }} />
      <button className="picker-tab" onClick={onRemove}>Remove</button>
    </div>
  )
}

/** Icon picker: Emoji tab with search, 🎲 random, Recent, every group of emoji, and Remove. */
export function EmojiPicker({ anchor, onPick, onClose }: { anchor: DOMRect; onPick: (emoji: string | undefined) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const found = q.trim() ? searchEmoji(q) : null
  const recent = recentEmoji()
  const choose = (e: string | undefined) => {
    if (e) localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recent.filter((r) => r !== e)].slice(0, 18)))
    onPick(e)
    onClose()
  }
  return (
    <Popover anchor={anchor} onClose={onClose} width={408}>
      <PickerTabs tabs={['Emoji']} tab="Emoji" onTab={() => {}} onRemove={() => choose(undefined)} />
      <div className="picker-top">
        <input autoFocus className="input" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" title="Random" onClick={() => choose(randomEmoji())}>🎲</button>
      </div>
      <div className="emoji-scroll">
        {!found && recent.length > 0 && (
          <div>
            <div className="menu-section">Recent</div>
            <div className="emoji-grid">
              {recent.map((e) => (
                <button key={e} className="emoji-btn" onClick={() => choose(e)}>{e}</button>
              ))}
            </div>
          </div>
        )}
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

/** Cover picker like Notion's: Gallery (colours and gradients) and Link tabs, Remove on the right. */
export function CoverPicker({ anchor, current, onPick, onClose }: { anchor: DOMRect; current?: string; onPick: (cover: string | undefined) => void; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [tab, setTab] = useState<'Gallery' | 'Link'>('Gallery')
  const choose = (c: string | undefined) => {
    onPick(c)
    onClose()
  }
  const urlOk = /^https:\/\/\S+$/.test(url.trim()) && !!coverCss(url.trim())
  return (
    <Popover anchor={anchor} onClose={onClose} width={540}>
      <PickerTabs tabs={['Gallery', 'Link']} tab={tab} onTab={setTab} onRemove={() => choose(undefined)} />
      {tab === 'Gallery' ? (
        <div className="cover-scroll">
          <div className="menu-section">Color &amp; Gradient</div>
          <div className="cover-grid">
            {[...SOLIDS, ...Object.keys(COVER_PRESETS)].map((k) => (
              <button key={k} className={`cover-swatch ${current === k ? 'active' : ''}`} title={k.startsWith('#') ? undefined : k} style={{ background: COVER_PRESETS[k] ?? k }} onClick={() => choose(k)} />
            ))}
          </div>
        </div>
      ) : (
      <div className="picker-top cover-link">
        <input
          className="input"
          placeholder="Paste an https image link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && urlOk && choose(url.trim())}
        />
        <button className="btn small primary" disabled={!urlOk} onClick={() => choose(url.trim())}>Submit</button>
      </div>
      )}
    </Popover>
  )
}
