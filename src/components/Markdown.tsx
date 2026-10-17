import { inlineMarkdownToHtml, markdownToBlocks } from '../markdown'

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l)
/** The `| --- | :---: |` line under a table header. */
const isSeparator = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l)
const splitRow = (l: string) =>
  l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))

/** Split text into normal Markdown chunks and Markdown tables (runs of `| a | b |` lines). */
function chunks(text: string): ({ kind: 'md'; text: string } | { kind: 'table'; rows: string[][] })[] {
  const out: ({ kind: 'md'; text: string } | { kind: 'table'; rows: string[][] })[] = []
  let md: string[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (isTableLine(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      if (md.length) out.push({ kind: 'md', text: md.join('\n') })
      md = []
      const rows = [splitRow(lines[i])]
      i += 2
      while (i < lines.length && isTableLine(lines[i])) rows.push(splitRow(lines[i++]))
      i--
      out.push({ kind: 'table', rows })
    } else md.push(lines[i])
  }
  if (md.length) out.push({ kind: 'md', text: md.join('\n') })
  return out
}

/** Lightweight read-only preview of AI Markdown, styled like editor blocks. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      {chunks(text).map((c, ci) =>
        c.kind === 'table' ? <MdTable key={ci} rows={c.rows} /> : <MdBlocks key={ci} text={c.text} />,
      )}
    </div>
  )
}

function MdTable({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows
  const cell = (s: string) => ({ __html: inlineMarkdownToHtml(s) })
  return (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>{head.map((h, i) => <th key={i} dangerouslySetInnerHTML={cell(h)} />)}</tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>{head.map((_, i) => <td key={i} dangerouslySetInnerHTML={cell(r[i] ?? '')} />)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MdBlocks({ text }: { text: string }) {
  const specs = markdownToBlocks(text)
  let n = 0
  return (
    <>
      {specs.map((s, i) => {
        n = s.type === 'numbered_list' ? n + 1 : 0
        const html = { __html: s.title }
        switch (s.type) {
          case 'header': return <h2 key={i} dangerouslySetInnerHTML={html} />
          case 'sub_header': return <h3 key={i} dangerouslySetInnerHTML={html} />
          case 'sub_sub_header': return <h4 key={i} dangerouslySetInnerHTML={html} />
          case 'bulleted_list': return <div key={i} className="md-li"><span className="bullet">•</span><span dangerouslySetInnerHTML={html} /></div>
          case 'numbered_list': return <div key={i} className="md-li"><span className="bullet">{n}.</span><span dangerouslySetInnerHTML={html} /></div>
          case 'to_do': return <div key={i} className="md-li"><span className="bullet">{s.checked ? '☑' : '☐'}</span><span dangerouslySetInnerHTML={html} /></div>
          case 'quote': return <blockquote key={i} dangerouslySetInnerHTML={html} />
          case 'divider': return <hr key={i} />
          case 'code': return <pre key={i}><code>{s.title}</code></pre>
          default: return <p key={i} dangerouslySetInnerHTML={html} />
        }
      })}
    </>
  )
}
