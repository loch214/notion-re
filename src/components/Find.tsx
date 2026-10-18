import { useEffect, useRef, useState } from 'react'

/** Find in page (Ctrl+F): highlights every match with the CSS Custom Highlight API. */
export function FindBar({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [ranges, setRanges] = useState<Range[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.select()
  }, [])

  const search = (query: string) => {
    const found: Range[] = []
    const root = document.querySelector('.page-inner')
    if (root && query) {
      const needle = query.toLowerCase()
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = (n.textContent ?? '').toLowerCase()
        for (let i = t.indexOf(needle); i >= 0; i = t.indexOf(needle, i + needle.length)) {
          const r = new Range()
          r.setStart(n, i)
          r.setEnd(n, i + needle.length)
          found.push(r)
        }
      }
    }
    setRanges(found)
    setIdx(0)
  }

  useEffect(() => {
    if (!('highlights' in CSS)) return
    CSS.highlights.set('find-all', new Highlight(...ranges))
    if (ranges[idx]) {
      CSS.highlights.set('find-current', new Highlight(ranges[idx]))
      ranges[idx].startContainer.parentElement?.scrollIntoView({ block: 'center' })
    } else CSS.highlights.delete('find-current')
  }, [ranges, idx])

  useEffect(
    () => () => {
      if ('highlights' in CSS) {
        CSS.highlights.delete('find-all')
        CSS.highlights.delete('find-current')
      }
    },
    [],
  )

  const step = (d: number) => {
    if (ranges.length) setIdx((idx + d + ranges.length) % ranges.length)
  }

  return (
    <div className="find-bar">
      <input
        ref={input}
        autoFocus
        className="input"
        placeholder="Find in page"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          search(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          else if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          }
        }}
      />
      <span className="find-count">{q ? (ranges.length ? `${idx + 1} / ${ranges.length}` : 'No results') : ''}</span>
      <button className="ctl" title="Previous (Shift+Enter)" onClick={() => step(-1)}>↑</button>
      <button className="ctl" title="Next (Enter)" onClick={() => step(1)}>↓</button>
      <button className="ctl" title="Close (Esc)" onClick={onClose}>×</button>
    </div>
  )
}
