// Browser-side text helpers. Pure Markdown logic lives in shared/blocks.ts.

export {
  escapeHtml,
  inlineMarkdownToHtml,
  insertSpecs,
  markdownToBlocks,
  pageToMarkdown,
  type BlockSpec,
} from '../shared/blocks.ts'
import { BLOCK_COLORS, escapeHtml } from '../shared/blocks.ts'

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'CODE', 'A', 'BR', 'SPAN'])

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
    if (tag === 'span') {
      // Inline text colour / highlight only (`data-color="red"` or `"red_background"`).
      const c = el.getAttribute('data-color') ?? ''
      return (BLOCK_COLORS as string[]).includes(c) && inner ? `<span data-color="${c}">${inner}</span>` : inner
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? ''
      if (/^#\/[\w-]+$/.test(href)) return `<a href="${href}">${inner}</a>`
      if (!/^(https?:|mailto:)/i.test(href)) return inner
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    }
    return `<${tag}>${inner}</${tag}>`
  }
  return [...doc.body.firstChild!.childNodes].map(clean).join('').replace(/(<br>)+$/, '')
}

export function htmlToText(html: string) {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.textContent ?? ''
}
