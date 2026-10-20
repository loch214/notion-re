// Library (Notion's sidebar "Library"): every page in a table with tabs Recents / Favorites / Private,
// columns Page name · Source · Last edited time · Last visited time, a search box and "New page".

import { useMemo, useState } from 'react'
import { pageTitle, useStore } from '../store'
import type { Block } from '../types'
import { Icon, type IconName } from './Icons'
import { readRecents, readVisited } from './Sidebar'

type Tab = 'recents' | 'favorites' | 'private'
const TABS: [Tab, string, IconName][] = [
  ['recents', 'Recents', 'clock'],
  ['favorites', 'Favorites', 'star'],
  ['private', 'Private', 'lock'],
]

/** "Just now", "12m ago", "3h ago", then "May 18" like Notion's Library. */
function ago(ms?: number) {
  if (!ms) return ''
  const s = (Date.now() - ms) / 1000
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const d = new Date(ms)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

export function Library() {
  const blocks = useStore((s) => s.blocks)
  const [tab, setTab] = useState<Tab>('recents')
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const visited = readVisited()

  const rows = useMemo(() => {
    // Skip templates and pages inside something that is in the Trash.
    const live = (b?: Block) => {
      if (!b || b.type !== 'page' || b.format.template) return false
      for (let cur: Block | undefined = b; cur; cur = cur.parent_id ? blocks[cur.parent_id] : undefined) if (!cur.alive) return false
      return true
    }
    let list: Block[]
    if (tab === 'recents') list = readRecents().map((id) => blocks[id]).filter(live)
    else if (tab === 'favorites') list = Object.values(blocks).filter((b) => live(b) && b.format.favorite)
    else list = Object.values(blocks).filter((b) => live(b) && !blocks[b.parent_id ?? '']?.schema).sort((a, b) => b.last_edited_time - a.last_edited_time)
    const needle = q.trim().toLowerCase()
    return needle ? list.filter((b) => pageTitle(b).toLowerCase().includes(needle)) : list
  }, [blocks, tab, q])

  const source = (b: Block) => {
    const parent = b.parent_id ? blocks[b.parent_id] : undefined
    if (!parent) return { icon: 'lock' as IconName, label: 'Private' }
    return { icon: (parent.schema ? 'tableView' : 'page') as IconName, label: pageTitle(parent) }
  }

  return (
    <div className="library">
      <div className="library-head">
        <h1>Library</h1>
        <button className="btn primary small" onClick={() => useStore.getState().createPage(null)}>New page</button>
      </div>
      <div className="db-views library-tabs">
        {TABS.map(([t, label, icon]) => (
          <button key={t} className={`db-view-tab ${t === tab ? 'active' : ''}`} onClick={() => setTab(t)}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {searching ? (
          <span className="db-search">
            <Icon name="search" size={14} />
            <input autoFocus placeholder="Type to search…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => !q && setSearching(false)} onKeyDown={(e) => e.key === 'Escape' && (setQ(''), setSearching(false))} />
          </span>
        ) : (
          <button className="ctl db-tool" title="Search" onClick={() => setSearching(true)}>
            <Icon name="search" size={16} />
          </button>
        )}
      </div>
      <table className="library-table">
        <thead>
          <tr>
            <th><Icon name="page" size={14} /> Page name</th>
            <th><Icon name="moveTo" size={14} /> Source</th>
            <th><Icon name="clock" size={14} /> Last edited time</th>
            <th><Icon name="clock" size={14} /> Last visited time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const src = source(b)
            return (
              <tr key={b.id} onClick={() => useStore.getState().openPage(b.id)}>
                <td className="library-name">
                  <span className="library-icon">{b.format.icon ?? <Icon name="page" size={16} />}</span>
                  <span>{pageTitle(b)}</span>
                </td>
                <td className="library-src"><Icon name={src.icon} size={14} /> {src.label}</td>
                <td>{ago(b.last_edited_time)}</td>
                <td>{ago(visited[b.id])}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="library-empty">{q ? 'No matches.' : tab === 'favorites' ? 'Pages you add to Favorites show up here.' : 'No pages yet.'}</div>}
    </div>
  )
}
