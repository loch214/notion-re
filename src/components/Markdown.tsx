import { markdownToBlocks } from '../markdown'

/** Lightweight read-only preview of AI Markdown, styled like editor blocks. */
export function Markdown({ text }: { text: string }) {
  const specs = markdownToBlocks(text)
  let n = 0
  return (
    <div className="md">
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
    </div>
  )
}
