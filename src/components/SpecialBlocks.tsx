// Blocks that aren't a line of text: image, video, embed, web bookmark, simple table,
// table of contents, columns, and the floating page outline.

import { useEffect, useRef, useState } from 'react'
import { embedUrl, mediaUrlOk } from '../../shared/blocks.ts'
import { htmlToText, sanitizeHtml } from '../markdown'
import { useStore, visibleOrder } from '../store'
import type { Block } from '../types'
import { BlockList, HEADINGS } from './Block'

const S = () => useStore.getState()

/** Upload a file to the local server (data/files); falls back to a data: URL without the server. */
async function upload(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const r = await fetch('/api/files', { method: 'POST', headers: { 'x-file-ext': ext }, body: file }).catch(() => null)
  if (r?.ok) return (await r.json()).url
  throw new Error(r ? (await r.json().catch(() => ({}))).error ?? 'Upload failed' : 'Upload needs the dev server')
}

const LABEL: Record<string, string> = { image: 'Add an image', video: 'Embed a video', embed: 'Embed a link', bookmark: 'Add a web bookmark' }

/** Empty media block: paste a link or upload a file (Notion's "Upload / Embed link" popover). */
function MediaEmpty({ block, locked }: { block: Block; locked: boolean }) {
  const [open, setOpen] = useState(!block.properties.url && Date.now() - block.created_time < 2000)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const canUpload = block.type === 'image' || block.type === 'video'
  const set = (u: string) => S().updateBlock(block.id, { properties: { url: u } })
  const submit = () => {
    const u = url.trim()
    if (!/^https:\/\//i.test(u)) return setError('Please enter a link that starts with https://')
    set(u)
  }
  return (
    <div className="media-empty-wrap">
      <button className="media-empty" disabled={locked} onClick={() => setOpen(!open)}>
        <span>{block.type === 'image' ? '🖼' : block.type === 'video' ? '🎬' : block.type === 'bookmark' ? '🔖' : '🔗'}</span>
        {LABEL[block.type]}
      </button>
      {open && !locked && (
        <div className="popover media-pop">
          {canUpload && (
            <>
              <button className="btn primary wide" onClick={() => fileRef.current?.click()}>Upload file</button>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept={block.type === 'image' ? 'image/*' : 'video/mp4,video/webm'}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) upload(f).then(set, (err) => setError(err.message))
                }}
              />
              <div className="muted small center">or</div>
            </>
          )}
          <input
            className="input"
            autoFocus
            placeholder={block.type === 'bookmark' ? 'Paste in https://…' : 'Paste the link…'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn wide" onClick={submit}>{block.type === 'bookmark' ? 'Create bookmark' : block.type === 'image' ? 'Embed image' : 'Embed link'}</button>
          {error && <div className="error small">{error}</div>}
        </div>
      )}
    </div>
  )
}

function Caption({ block, locked }: { block: Block; locked: boolean }) {
  const has = !!block.properties.caption
  return (
    <div
      className="caption"
      contentEditable={!locked}
      suppressContentEditableWarning
      data-placeholder={has ? undefined : 'Write a caption…'}
      onBlur={(e) => {
        const c = sanitizeHtml(e.currentTarget.innerHTML)
        if (c !== (block.properties.caption ?? '')) S().updateBlock(block.id, { properties: { caption: c || undefined } })
      }}
      dangerouslySetInnerHTML={{ __html: block.properties.caption ?? '' }}
    />
  )
}

export function MediaBlock({ block, locked }: { block: Block; locked: boolean }) {
  const url = block.properties.url
  const boxRef = useRef<HTMLDivElement>(null)
  if (!mediaUrlOk(url)) return <MediaEmpty block={block} locked={locked} />

  if (block.type === 'bookmark') {
    let host = url
    try {
      host = new URL(url).hostname
    } catch {
      /* keep the raw text */
    }
    const bm = block.properties.bookmark
    return (
      <a className="bookmark" href={url} target="_blank" rel="noopener noreferrer">
        <div className="bookmark-text">
          <div className="bookmark-title">{bm?.title || host}</div>
          {bm?.description && <div className="bookmark-desc">{bm.description}</div>}
          <div className="bookmark-url">🔗 {url}</div>
        </div>
      </a>
    )
  }

  // Drag the right edge to resize (Notion stores the width in px).
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const box = boxRef.current!
    const x0 = e.clientX
    const w0 = box.getBoundingClientRect().width
    const max = box.parentElement!.getBoundingClientRect().width
    const move = (ev: PointerEvent) => (box.style.width = `${Math.max(80, Math.min(max, w0 + ev.clientX - x0))}px`)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      S().updateBlock(block.id, { format: { block_width: Math.round(box.getBoundingClientRect().width) } })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const isFile = /\.(mp4|webm)$/i.test(url)
  let media: React.ReactNode
  if (block.type === 'image') media = <img src={url} alt={htmlToText(block.properties.caption ?? '')} draggable={false} />
  else if (block.type === 'video' && isFile) media = <video src={url} controls />
  else
    media = (
      <div className="embed-frame">
        <iframe src={embedUrl(url)} title={url} allowFullScreen sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
      </div>
    )

  const align = block.format.block_alignment ?? 'center'
  return (
    <div className={`media align-${align}`}>
      <div className="media-box" ref={boxRef} style={{ width: block.format.block_width ?? (block.type === 'image' ? undefined : '100%') }}>
        {media}
        {!locked && <span className="resize-handle" onPointerDown={startResize} />}
        {!locked && (
          <div className="media-tools">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={align === a ? 'on' : ''} title={`Align ${a}`} onClick={() => S().updateBlock(block.id, { format: { block_alignment: a } })}>
                {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
              </button>
            ))}
            <a href={url} target="_blank" rel="noopener noreferrer" title="Original">↗</a>
            <button title="Replace" onClick={() => S().updateBlock(block.id, { properties: { url: undefined } })}>⟳</button>
          </div>
        )}
      </div>
      <Caption block={block} locked={locked} />
    </div>
  )
}

/** Notion's simple table: rows are `table_row` blocks, each with one rich-text cell per column. */
export function TableBlock({ block, locked }: { block: Block; locked: boolean }) {
  const blocks = useStore((s) => s.blocks)
  const rows = block.content.filter((r) => blocks[r]?.alive)
  const width = block.format.table_width ?? 3
  const setCell = (rowId: string, i: number, html: string) => {
    const row = [...(blocks[rowId].properties.row ?? [])]
    while (row.length < width) row.push('')
    if (row[i] === html) return
    row[i] = html
    S().updateBlock(rowId, { properties: { row } })
  }
  const addRow = () => S().insertTree({ parent: block.id }, { type: 'table_row', properties: { row: Array(width).fill('') } })
  const addCol = () => S().updateBlock(block.id, { format: { table_width: width + 1 } })
  const focusCell = (r: number, c: number) =>
    document.querySelector<HTMLElement>(`[data-block-id="${block.id}"] td[data-cell="${r}-${c}"]`)?.focus()

  return (
    <div className="simple-table-wrap">
      <table className={`simple-table ${block.format.table_header_row ? 'head-row' : ''} ${block.format.table_header_column ? 'head-col' : ''}`}>
        <tbody>
          {rows.map((rid, r) => (
            <tr key={rid}>
              {Array.from({ length: width }, (_, c) => (
                <td
                  key={c}
                  data-cell={`${r}-${c}`}
                  contentEditable={!locked}
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: blocks[rid].properties.row?.[c] ?? '' }}
                  onBlur={(e) => setCell(rid, c, sanitizeHtml(e.currentTarget.innerHTML))}
                  onKeyDown={(e) => {
                    // Tab / Shift+Tab walk the cells; Tab in the last cell adds a row.
                    if (e.key === 'Tab') {
                      e.preventDefault()
                      const n = r * width + c + (e.shiftKey ? -1 : 1)
                      if (n >= rows.length * width) {
                        addRow()
                        setTimeout(() => focusCell(rows.length, 0))
                      } else if (n >= 0) focusCell(Math.floor(n / width), n % width)
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (r + 1 < rows.length) focusCell(r + 1, c)
                    }
                  }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!locked && (
        <>
          <button className="table-add col" title="Add a column" onClick={addCol}>+</button>
          <button className="table-add row" title="Add a row" onClick={addRow}>+</button>
        </>
      )}
    </div>
  )
}

export function TableOfContents({ pageId }: { pageId: string }) {
  const blocks = useStore((s) => s.blocks)
  const heads = visibleOrder(blocks, pageId).filter((id) => HEADINGS.has(blocks[id].type))
  if (!heads.length) return <div className="toc muted">Add headings to create a table of contents.</div>
  const level = (t: string) => ['header', 'sub_header', 'sub_sub_header', 'header_4'].indexOf(t)
  return (
    <div className="toc">
      {heads.map((id) => (
        <div
          key={id}
          className="toc-item"
          style={{ paddingLeft: level(blocks[id].type) * 24 }}
          onClick={() => document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          {htmlToText(blocks[id].properties.title) || 'Untitled'}
        </div>
      ))}
    </div>
  )
}

/** Columns side by side; drag the gap between two columns to resize them. */
export function Columns({ block, pageId, locked }: { block: Block; pageId: string; locked: boolean }) {
  const blocks = useStore((s) => s.blocks)
  const cols = block.content.filter((c) => blocks[c]?.alive)
  const rowRef = useRef<HTMLDivElement>(null)
  const ratio = (id: string) => blocks[id].format.column_ratio ?? 1 / cols.length

  const resize = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const total = rowRef.current!.getBoundingClientRect().width
    const [a, b] = [cols[i], cols[i + 1]]
    const sum = ratio(a) + ratio(b)
    const x0 = e.clientX
    const r0 = ratio(a)
    let next = r0
    const els = rowRef.current!.querySelectorAll<HTMLElement>(':scope > .column')
    const move = (ev: PointerEvent) => {
      next = Math.max(0.1, Math.min(sum - 0.1, r0 + (ev.clientX - x0) / total))
      els[i].style.flexGrow = String(next)
      els[i + 1].style.flexGrow = String(sum - next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      S().transact(() => {
        S().updateBlock(a, { format: { column_ratio: next } })
        S().updateBlock(b, { format: { column_ratio: sum - next } })
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="columns" ref={rowRef}>
      {cols.map((cid, i) => {
        const empty = !blocks[cid].content.some((c) => blocks[c]?.alive)
        return [
          i > 0 && !locked && <div key={`g${i}`} className="column-gap" onPointerDown={resize(i - 1)} />,
          <div key={cid} className="column" style={{ flexGrow: ratio(cid), flexBasis: 0 }}>
            <BlockList ids={blocks[cid].content} pageId={pageId} />
            {empty && !locked && (
              <div
                className="column-empty"
                onClick={() => {
                  const id = S().insertBlock({ parent: cid })
                  S().requestFocus({ id, at: 'start' })
                }}
              />
            )}
          </div>,
        ]
      })}
    </div>
  )
}

/** Notion's floating outline on the right of a page: one short line per heading (longer for bigger
 * headings, the one you're reading highlighted); hover to see the headings, click to jump. */
export function PageOutline({ pageId }: { pageId: string }) {
  const blocks = useStore((s) => s.blocks)
  const heads = visibleOrder(blocks, pageId).filter((id) => HEADINGS.has(blocks[id].type))
  const [current, setCurrent] = useState<string | null>(null)
  useEffect(() => {
    const onScroll = () => {
      let cur: string | null = null
      for (const id of heads) {
        const el = document.querySelector(`.page [data-block-id="${id}"]`)
        if (el && el.getBoundingClientRect().top < 160) cur = id
      }
      setCurrent(cur ?? heads[0] ?? null)
    }
    onScroll()
    document.addEventListener('scroll', onScroll, true)
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [heads.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  if (heads.length < 2) return null
  const level = (t: string) => ['header', 'sub_header', 'sub_sub_header', 'header_4'].indexOf(t)
  const go = (id: string) => document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="outline-anchor">
      <div className="outline">
        <div className="outline-lines">
          {heads.map((id) => (
            <span key={id} className={`outline-line l${level(blocks[id].type)} ${id === current ? 'on' : ''}`} />
          ))}
        </div>
        <div className="outline-panel popover">
          {heads.map((id) => (
            <div key={id} className={`outline-item ${id === current ? 'on' : ''}`} style={{ paddingLeft: 8 + level(blocks[id].type) * 12 }} onClick={() => go(id)}>
              {htmlToText(blocks[id].properties.title) || 'Untitled'}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
