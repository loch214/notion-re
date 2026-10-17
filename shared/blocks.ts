// Pure block helpers shared by the web app and the Node side (sync server, MCP).
// No DOM APIs in here.

import type { Block, BlockType, DbProperty, OptionColor, PropertyType } from '../src/types'

export interface Workspace {
  blocks: Record<string, Block>
  rootPages: string[]
}

// ---- databases ----

export const OPTION_COLORS: OptionColor[] = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

export const PROPERTY_TYPES: { type: PropertyType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: '≡' },
  { type: 'number', label: 'Number', icon: '#' },
  { type: 'select', label: 'Select', icon: '⊙' },
  { type: 'multi_select', label: 'Multi-select', icon: '☰' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑' },
  { type: 'url', label: 'URL', icon: '🔗' },
]

export const shortId = () => crypto.randomUUID().slice(0, 8)

/** A new database starts like Notion's: a Name (title) column and a Tags column. */
export function defaultSchema(): DbProperty[] {
  return [
    { id: 'title', name: 'Name', type: 'title' },
    { id: shortId(), name: 'Tags', type: 'multi_select', options: [] },
  ]
}

/** Plain-text form of a row's cell (used for Markdown, search, and sorting). */
export function cellText(prop: DbProperty, row: Block): string {
  if (prop.type === 'title') return row.properties.title
  const v = row.properties.cells?.[prop.id]
  if (v === undefined || v === null || v === '') return ''
  const optName = (id: string) => prop.options?.find((o) => o.id === id)?.name ?? ''
  switch (prop.type) {
    case 'checkbox': return v ? 'Yes' : 'No'
    case 'select': return optName(String(v))
    case 'multi_select': return (Array.isArray(v) ? v : []).map(optName).filter(Boolean).join(', ')
    default: return String(v)
  }
}

/** Live rows of a database, in order. */
export function dbRows(blocks: Record<string, Block>, db: Block): Block[] {
  return db.content.map((id) => blocks[id]).filter((b) => b?.alive && b.type === 'page')
}

function databaseToMarkdown(blocks: Record<string, Block>, db: Block, withIds: boolean): string[] {
  const schema = db.schema ?? []
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const head = [...(withIds ? ['row id'] : []), ...schema.map((p) => `${p.name} (${p.type})`)]
  const lines = [`| ${head.map(esc).join(' | ')} |`, `|${head.map(() => ' --- |').join('')}`]
  for (const row of dbRows(blocks, db)) {
    const cells = [...(withIds ? [row.id] : []), ...schema.map((p) => cellText(p, row))]
    lines.push(`| ${cells.map(esc).join(' | ')} |`)
  }
  return lines
}

export function makeBlock(type: BlockType, parent_id: string | null, title = ''): Block {
  const t = Date.now()
  return {
    id: crypto.randomUUID(),
    type,
    parent_id,
    content: [],
    properties: { title, ...(type === 'to_do' ? { checked: false } : {}) },
    format: type === 'callout' ? { icon: '💡' } : {},
    alive: true,
    created_time: t,
    last_edited_time: t,
  }
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function unescapeHtml(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
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

/** Our stored inline HTML (b, i, u, s, code, a, br only) → inline Markdown. */
export function htmlToInlineMarkdown(html: string): string {
  const md = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<s>([\s\S]*?)<\/s>/gi, '~~$1~~')
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
  return unescapeHtml(md)
}

export function htmlToPlain(html: string) {
  return unescapeHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
}

export interface BlockSpec {
  type: BlockType
  title: string
  checked?: boolean
  /** Nesting level from list indentation (2 spaces or a tab per level). */
  depth: number
}

/** Parse Markdown into block specs (titles converted to our inline HTML). */
export function markdownToBlocks(md: string): BlockSpec[] {
  const specs: BlockSpec[] = []
  const lines = md.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      const code: string[] = []
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i])
      specs.push({ type: 'code', title: code.join('\n'), depth: 0 })
      continue
    }
    const t = line.trim()
    if (!t) continue
    const indent = line.match(/^[ \t]*/)![0].replace(/\t/g, '  ').length
    const depth = Math.floor(indent / 2)
    const push = (type: BlockType, text: string, extra: Partial<BlockSpec> = {}) =>
      specs.push({ type, title: inlineMarkdownToHtml(text), depth, ...extra })
    let m: RegExpMatchArray | null
    if ((m = t.match(/^#{1,2}\s+(.*)/)) && !t.startsWith('###')) push('header', m[1], { depth: 0 })
    else if ((m = t.match(/^###\s+(.*)/))) push('sub_header', m[1], { depth: 0 })
    else if ((m = t.match(/^#{4,6}\s+(.*)/))) push('sub_sub_header', m[1], { depth: 0 })
    else if ((m = t.match(/^[-*]\s+\[([ xX])\]\s+(.*)/))) push('to_do', m[2], { checked: m[1] !== ' ' })
    else if ((m = t.match(/^[-*+]\s+(.*)/))) push('bulleted_list', m[1])
    else if ((m = t.match(/^\d+[.)]\s+(.*)/))) push('numbered_list', m[1])
    else if ((m = t.match(/^>\s?(.*)/))) push('quote', m[1], { depth: 0 })
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) specs.push({ type: 'divider', title: '', depth: 0 })
    else push('text', t)
  }
  return specs
}

/**
 * Serialize a page to Markdown. With `withIds`, every line is prefixed with the
 * block id so an AI agent can target individual blocks for edits.
 */
export function pageToMarkdown(blocks: Record<string, Block>, pageId: string, withIds = false): string {
  const out: string[] = []
  const page = blocks[pageId]
  if (!page) return ''
  out.push(`# ${page.format.icon ? page.format.icon + ' ' : ''}${page.properties.title || 'Untitled'}`, '')
  if (page.schema) {
    out.push('(This page is a database. Each row is a page.)', '', ...databaseToMarkdown(blocks, page, withIds))
    return out.join('\n')
  }
  const parent = page.parent_id ? blocks[page.parent_id] : undefined
  if (parent?.schema) {
    // A database row: list its properties first.
    for (const p of parent.schema) if (p.type !== 'title') out.push(`- ${p.name}: ${cellText(p, page) || '(empty)'}`)
    out.push('')
  }
  const walk = (id: string, depth: number) => {
    let n = 0
    for (const cid of blocks[id]?.content ?? []) {
      const b = blocks[cid]
      if (!b?.alive) continue
      const pad = '  '.repeat(depth)
      const tag = withIds ? `[${b.id}] ` : ''
      const t = b.type === 'code' || b.type === 'page' ? b.properties.title : htmlToInlineMarkdown(b.properties.title)
      n = b.type === 'numbered_list' ? n + 1 : 0
      switch (b.type) {
        case 'header': out.push(`${tag}## ${t}`); break
        case 'sub_header': out.push(`${tag}### ${t}`); break
        case 'sub_sub_header': out.push(`${tag}#### ${t}`); break
        case 'bulleted_list': out.push(`${pad}${tag}- ${t}`); break
        case 'toggle': out.push(`${pad}${tag}▸ ${t}`); break
        case 'numbered_list': out.push(`${pad}${tag}${n}. ${t}`); break
        case 'to_do': out.push(`${pad}${tag}- [${b.properties.checked ? 'x' : ' '}] ${t}`); break
        case 'quote': out.push(`${pad}${tag}> ${t}`); break
        case 'callout': out.push(`${pad}${tag}> ${b.format.icon ?? '💡'} ${t}`); break
        case 'divider': out.push(`${tag}---`); break
        case 'code': out.push(`${tag}\`\`\``, t, '```'); break
        case 'page': out.push(`${pad}${tag}[${b.schema ? 'Database' : 'Sub-page'}: ${t || 'Untitled'}]`); break
        default: out.push(`${pad}${tag}${t}`)
      }
      if (b.type !== 'page') walk(cid, depth + 1)
    }
  }
  walk(pageId, 0)
  return out.join('\n')
}

/**
 * Insert parsed Markdown blocks into `parentId` (after `afterId`, or at the end),
 * honouring list indentation. Mutates `blocks`. Returns the new top-level ids.
 */
export function insertSpecs(
  blocks: Record<string, Block>,
  parentId: string,
  specs: BlockSpec[],
  afterId?: string,
): string[] {
  const now = Date.now()
  const created: string[] = []
  // stack[d] = id of the last block inserted at depth d
  const stack: string[] = []
  let cursor = afterId
  for (const spec of specs) {
    const depth = Math.min(spec.depth, stack.length)
    const parent = depth === 0 ? parentId : stack[depth - 1]
    const b = makeBlock(spec.type, parent, spec.title)
    if (spec.checked) b.properties.checked = true
    blocks[b.id] = b
    const p = blocks[parent]
    const content = [...p.content]
    if (depth === 0) {
      const at = cursor ? content.indexOf(cursor) + 1 : content.length
      content.splice(at > 0 ? at : content.length, 0, b.id)
      cursor = b.id
      created.push(b.id)
    } else content.push(b.id)
    blocks[parent] = { ...p, content, last_edited_time: now }
    stack.length = depth
    stack.push(b.id)
  }
  return created
}
