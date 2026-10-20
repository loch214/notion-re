// Templates gallery (sidebar → Templates): category list on the left, a preview of the picked
// template on the right, "Use template" adds it to the sidebar. Layout follows Notion's gallery.

import { useEffect, useState } from 'react'
import { markdownToBlocks } from '../../shared/blocks.ts'
import { TEMPLATES, type Template } from '../../shared/templates'
import { useStore } from '../store'
import { Icon } from './Icons'

const CATEGORIES = ['Planning', 'Personal', 'Work'] as const

function Preview({ t }: { t: Template }) {
  const d = t.database
  if (!d) {
    return (
      <div className="tpl-preview-page">
        {markdownToBlocks(t.body ?? '').map((b, i) =>
          b.type === 'header' ? <h3 key={i} dangerouslySetInnerHTML={{ __html: b.title }} />
          : b.type === 'to_do' ? <div key={i} className="tpl-todo"><span className="tpl-box" /> <span dangerouslySetInnerHTML={{ __html: b.title || '&nbsp;' }} /></div>
          : <p key={i} dangerouslySetInnerHTML={{ __html: b.title }} />,
        )}
      </div>
    )
  }
  const cols = [d.title_column ?? 'Name', ...d.columns.map((c) => c.name)].slice(0, 5)
  return (
    <div className="tpl-preview-db">
      <div className="tpl-preview-tabs">
        {d.views.map((v, i) => <span key={v.name} className={i === 0 ? 'on' : ''}>{v.name}</span>)}
      </div>
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {(d.rows?.length ? d.rows : [{ title: '', values: {} }, { title: '', values: {} }]).map((r, i) => (
            <tr key={i}>
              <td><b>{r.icon ? `${r.icon} ` : ''}{r.title}</b></td>
              {cols.slice(1).map((c) => {
                const v = r.values?.[c]
                const col = d.columns.find((x) => x.name === c)
                const shown = v === undefined ? '' : col?.type === 'date' ? '📅' : Array.isArray(v) ? v.join(', ') : String(v)
                const color = col?.options?.find((o) => o[0] === (Array.isArray(v) ? v[0] : v))?.[1]
                return <td key={c}>{shown && (col?.options ? <span className={`db-pill opt-${color ?? 'default'}`}>{shown}</span> : shown)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TemplatesModal({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(TEMPLATES[0].key)
  const t = TEMPLATES.find((x) => x.key === key)!
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal templates-modal" role="dialog" aria-label="Templates">
        <nav className="settings-nav">
          <div className="tpl-nav-title">Templates</div>
          {CATEGORIES.map((c) => (
            <div key={c}>
              <div className="settings-nav-head">{c}</div>
              {TEMPLATES.filter((x) => x.category === c).map((x) => (
                <button key={x.key} className={`settings-nav-item ${x.key === key ? 'active' : ''}`} onClick={() => setKey(x.key)}>
                  <span className="tpl-nav-icon">{x.icon}</span> {x.name}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="tpl-main">
          <header className="tpl-head">
            <span className="tpl-head-icon">{t.icon}</span>
            <div className="tpl-head-text">
              <b>{t.name}</b>
              <span>{t.description}</span>
            </div>
            <button
              className="btn primary"
              onClick={() => {
                useStore.getState().addFromTemplate(t.key, null)
                onClose()
              }}
            >
              Use template
            </button>
            <button className="ctl" title="Close" onClick={onClose}><Icon name="close" size={16} /></button>
          </header>
          <div className="tpl-stage">
            <div className="tpl-paper">
              <div className="tpl-paper-icon">{t.icon}</div>
              <h1>{t.name}</h1>
              <Preview t={t} />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
