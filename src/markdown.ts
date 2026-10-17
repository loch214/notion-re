import type { Block, BlockType } from './types'

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'CODE', 'A', 'BR'])

/** Keep only simple inline formatting; strip everything else (scripts, styles, attributes). */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const inner = [...el.childNodes].map(clean).join('')
    if (!ALLOWED.has(el.tagName)) return inner
    const tag = { STRONG: 'b', EM: 'i', STRIKE: 's' }[el.tagName] ?? el.tagName.toLowerCase()
    if (tag === 'br') return '<br>'
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? ''
      if (!/^(https?:|mailto:)/i.test(href)) return inner
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    }
    return `<${tag}>${inner}</${tag}>`
  }
  return [...doc.body.firstChild!.childNodes].map(clean).join('').replace(/(<br>)+$/, '')
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function htmlToText(html: string) {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.textContent ?? ''
}

/** Inline Markdown (**bold**, *italic*, `code`, ~~strike~~, [link](url)) → safe HTML. */
export function inlineMarkdownToHtml(md: string): string {
  let h = escapeHtml(md)
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  h = h.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  return h
}

function htmlToInlineMarkdown(html: string): string {
  const d = document.createElement('div')
  d.innerHTML = html
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? ''
    const el = n as Element
    const inner = [...el.childNodes].map(walk).join('')
    switch (el.tagName) {
      case 'B': return `**${inner}**`
      case 'I': return `*${inner}*`
      case 'S': return `~~${inner}~~`
      case 'CODE': return `\`${inner}\``
      case 'A': return `[${inner}](${el.getAttribute('href')})`
      case 'BR': return '\n'
      default: return inner
    }
  }
  return [...d.childNodes].map(walk).join('')
}

/** Serialize a page (and nested blocks) to Markdown — used as AI context. */
export function pageToMarkdown(blocks: Record<string, Block>, pageId: string): string {
  const out: string[] = []
  const page = blocks[pageId]
  if (page?.properties.title) out.push(`# ${page.properties.title}`, '')
  const walk = (id: string, depth: number) => {
    let n = 0
    for (const cid of blocks[id]?.content ?? []) {
      const b = blocks[cid]
      if (!b?.alive) continue
      const pad = '  '.repeat(depth)
      const t = b.type === 'code' ? b.properties.title : htmlToInlineMarkdown(b.properties.title)
      n = b.type === 'numbered_list' ? n + 1 : 0
      switch (b.type) {
        case 'header': out.push(`## ${t}`); break
        case 'sub_header': out.push(`### ${t}`); break
        case 'sub_sub_header': out.push(`#### ${t}`); break
        case 'bulleted_list': case 'toggle': out.push(`${pad}- ${t}`); break
        case 'numbered_list': out.push(`${pad}${n}. ${t}`); break
        case 'to_do': out.push(`${pad}- [${b.properties.checked ? 'x' : ' '}] ${t}`); break
        case 'quote': out.push(`> ${t}`); break
        case 'callout': out.push(`> ${b.format.icon ?? ''} ${t}`); break
        case 'divider': out.push('---'); break
        case 'code': out.push('```', t, '```'); break
        case 'page': out.push(`${pad}[Sub-page: ${t || 'Untitled'}]`); break
        default: out.push(`${pad}${t}`)
      }
      if (b.type !== 'page') walk(cid, depth + 1)
    }
  }
  walk(pageId, 0)
  return out.join('\n')
}

export interface BlockSpec {
  type: BlockType
  title: string
  checked?: boolean
}

/** Parse AI Markdown output into flat block specs. */
export function markdownToBlocks(md: string): BlockSpec[] {
  const specs: BlockSpec[] = []
  const lines = md.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^\s*```/)
    if (fence) {
      const code: string[] = []
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i])
      specs.push({ type: 'code', title: code.join('\n') })
      continue
    }
    const t = line.trim()
    if (!t) continue
    let m: RegExpMatchArray | null
    if ((m = t.match(/^#{1,2}\s+(.*)/)) && !t.startsWith('###')) specs.push({ type: 'header', title: inlineMarkdownToHtml(m[1]) })
    else if ((m = t.match(/^###\s+(.*)/))) specs.push({ type: 'sub_header', title: inlineMarkdownToHtml(m[1]) })
    else if ((m = t.match(/^#{4,6}\s+(.*)/))) specs.push({ type: 'sub_sub_header', title: inlineMarkdownToHtml(m[1]) })
    else if ((m = t.match(/^[-*]\s+\[([ xX])\]\s+(.*)/))) specs.push({ type: 'to_do', title: inlineMarkdownToHtml(m[2]), checked: m[1] !== ' ' })
    else if ((m = t.match(/^[-*+]\s+(.*)/))) specs.push({ type: 'bulleted_list', title: inlineMarkdownToHtml(m[1]) })
    else if ((m = t.match(/^\d+[.)]\s+(.*)/))) specs.push({ type: 'numbered_list', title: inlineMarkdownToHtml(m[1]) })
    else if ((m = t.match(/^>\s?(.*)/))) specs.push({ type: 'quote', title: inlineMarkdownToHtml(m[1]) })
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) specs.push({ type: 'divider', title: '' })
    else specs.push({ type: 'text', title: inlineMarkdownToHtml(t) })
  }
  return specs
}
