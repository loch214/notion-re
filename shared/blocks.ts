// Pure block helpers shared by the web app and the Node side (sync server, MCP).
// No DOM APIs in here.

import type { Block, BlockColor, BlockType, CellValue, ColorName, DbProperty, OptionColor, PropertyType, SelectOption } from '../src/types'

export interface Workspace {
  blocks: Record<string, Block>
  rootPages: string[]
}

/** Media URLs we render: https links and our own uploads. */
export function mediaUrlOk(url: string | undefined): url is string {
  return !!url && (/^https:\/\//i.test(url) || /^\/api\/files\/[\w.-]+$/.test(url))
}

/** Turn a YouTube / Vimeo / Loom / Google Maps link into its embeddable player address. */
export function embedUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    if (host === 'youtube.com') {
      const id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname}`
    if (host === 'loom.com') return url.replace('/share/', '/embed/')
  } catch {
    /* not a URL */
  }
  return url
}

/**
 * The top-level page list, made consistent with the blocks: each page whose parent is null
 * appears once (in the given order, new ones at the end); pages that now live inside another
 * page are dropped. Merges of two lists can otherwise bring back a page that was moved.
 */
export function normalizeRoots(blocks: Record<string, Block>, roots: string[]): string[] {
  const out = [...new Set(roots)].filter((id) => blocks[id]?.type === 'page' && blocks[id].parent_id === null)
  for (const b of Object.values(blocks)) if (b.type === 'page' && b.parent_id === null && !out.includes(b.id)) out.push(b.id)
  return out
}

// ---- styling ----

export const COLOR_NAMES: ColorName[] = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

export const BLOCK_COLORS: BlockColor[] = [...COLOR_NAMES, ...COLOR_NAMES.map((c) => `${c}_background` as const)]

export const COVER_PRESETS: Record<string, string> = {
  sunset: 'linear-gradient(120deg, #f6d365 0%, #fda085 100%)',
  mint: 'linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)',
  sky: 'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)',
  lime: 'linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)',
  candy: 'linear-gradient(120deg, #fbc2eb 0%, #a6c1ee 100%)',
  ocean: 'linear-gradient(120deg, #30cfd0 0%, #330867 100%)',
  night: 'linear-gradient(120deg, #434343 0%, #000000 100%)',
}

/**
 * Turn a stored cover into a safe CSS `background` value (or undefined if it isn't one we allow).
 * Accepts a preset name, a hex / rgb() colour, a linear/radial gradient, or an https image URL.
 */
export function coverCss(cover: string | undefined): string | undefined {
  if (!cover) return undefined
  const c = cover.trim()
  if (COVER_PRESETS[c.toLowerCase()]) return COVER_PRESETS[c.toLowerCase()]
  if (/^https:\/\/[^\s"'()\\]+$/i.test(c)) return `center / cover no-repeat url("${c}")`
  if (/^#[0-9a-f]{3,8}$/i.test(c)) return c
  if (/^(linear|radial)-gradient\([#\w\s,.%()-]+\)$/i.test(c) || /^rgba?\([\d\s,.%]+\)$/i.test(c)) return c
  return undefined
}

/** Short description of a page's look, for the AI. Empty when nothing is set. */
export function pageStyleSummary(page: Block): string {
  const f = page.format
  const presetName = Object.entries(COVER_PRESETS).find(([, v]) => v === f.cover)?.[0]
  const parts = [
    f.cover && `cover: ${presetName ?? f.cover}`,
    f.background && `background: ${f.background}`,
    f.page_font && f.page_font !== 'default' && `font: ${f.page_font}`,
    f.full_width && 'full width',
    f.small_text && 'small text',
    f.locked && 'locked',
    f.favorite && 'in Favorites',
  ].filter(Boolean)
  return parts.join(', ')
}

/**
 * Deep-copy a block and everything inside it under `parentId` (database rows and schema included).
 * Mutates `blocks`; returns the new id. The caller links the copy into its parent.
 */
export function duplicateTree(blocks: Record<string, Block>, id: string, parentId: string | null): string {
  const src = blocks[id]
  const t = Date.now()
  const copy: Block = structuredClone({ ...src, id: crypto.randomUUID(), parent_id: parentId, created_time: t, last_edited_time: t })
  blocks[copy.id] = copy
  copy.content = src.content.filter((c) => blocks[c]?.alive).map((c) => duplicateTree(blocks, c, copy.id))
  return copy.id
}

// ---- databases ----

export const OPTION_COLORS: OptionColor[] = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

export const PROPERTY_TYPES: { type: PropertyType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: '≡' },
  { type: 'number', label: 'Number', icon: '#' },
  { type: 'select', label: 'Select', icon: '⊙' },
  { type: 'status', label: 'Status', icon: '◐' },
  { type: 'multi_select', label: 'Multi-select', icon: '☰' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑' },
  { type: 'url', label: 'URL', icon: '🔗' },
  { type: 'created_time', label: 'Created time', icon: '🕓' },
  { type: 'last_edited_time', label: 'Last edited time', icon: '🕓' },
]

/** Single-choice column types (select behaves the same as status; status starts with Notion's three stages). */
export const isSingleChoice = (t: string) => t === 'select' || t === 'status'

export function statusOptions(): SelectOption[] {
  return [
    { id: shortId(), name: 'Not started', color: 'gray' },
    { id: shortId(), name: 'In progress', color: 'blue' },
    { id: shortId(), name: 'Done', color: 'green' },
  ]
}

const isoDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Raw value of a row's cell; created / last edited time come from the row itself. */
export function cellRaw(prop: DbProperty, row: Block): CellValue {
  if (prop.type === 'title') return row.properties.title
  if (prop.type === 'created_time') return isoDay(row.created_time)
  if (prop.type === 'last_edited_time') return isoDay(row.last_edited_time)
  return row.properties.cells?.[prop.id] ?? null
}

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
  const v = cellRaw(prop, row)
  if (v === undefined || v === null || v === '') return ''
  const optName = (id: string) => prop.options?.find((o) => o.id === id)?.name ?? ''
  switch (prop.type) {
    case 'checkbox': return v ? 'Yes' : 'No'
    case 'select':
    case 'status': return optName(String(v))
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

/**
 * Inline Markdown (**bold**, *italic*, `code`, ~~strike~~, [link](url)) → safe HTML.
 * Like Notion's AI Markdown, `<u>underline</u>` and `<span color="red">…</span>` /
 * `<span color="red_background">…</span>` (text colour / highlight) are allowed too.
 */
export function inlineMarkdownToHtml(md: string): string {
  let h = escapeHtml(md)
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  h = h.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  // Link to another page of this workspace: [Title](#/<pageId>)
  h = h.replace(/\[([^\]]+)\]\((#\/[\w-]+)\)/g, '<a href="$2">$1</a>')
  h = h.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>')
  for (let i = 0; i < 3; i++) {
    // Repeat for nested spans (colour inside highlight).
    h = h.replace(/&lt;span colou?r=&quot;([a-z_]+)&quot;&gt;((?:(?!&lt;span )[\s\S])*?)&lt;\/span&gt;/g, (all, c: string, inner: string) =>
      (BLOCK_COLORS as string[]).includes(c) ? `<span data-color="${c}">${inner}</span>` : inner,
    )
  }
  return h
}

/** Our stored inline HTML (b, i, u, s, code, a, br, colour span) → inline Markdown. */
export function htmlToInlineMarkdown(html: string): string {
  const md = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<s>([\s\S]*?)<\/s>/gi, '~~$1~~')
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<span data-color="([a-z_]+)">/gi, '<span color="$1">')
    .replace(/<(?!\/?(u|span)\b)[^>]+>/gi, '')
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
    else if ((m = t.match(/^####\s+(.*)/))) push('sub_sub_header', m[1], { depth: 0 })
    else if ((m = t.match(/^#{5,6}\s+(.*)/))) push('header_4', m[1], { depth: 0 })
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
  const style = withIds && pageStyleSummary(page)
  if (style) out.push(`(page style: ${style})`, '')
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
      // With ids, a block's look shows in its tag: [id|red_background|toggle heading|letters|starts at 5].
      const f = b.format
      const extras = [
        f.color,
        f.toggleable && `toggle heading${f.collapsed ? ' (closed)' : ''}`,
        b.type === 'toggle' && f.collapsed && 'closed',
        f.list_format,
        f.list_start_index !== undefined && `starts at ${f.list_start_index}`,
        f.quote_size === 'large' && 'large',
      ].filter(Boolean)
      const tag = withIds ? `[${[b.id, ...extras].join('|')}] ` : ''
      const t = b.type === 'code' || b.type === 'page' ? b.properties.title : htmlToInlineMarkdown(b.properties.title)
      n = b.type === 'numbered_list' ? n + 1 : 0
      switch (b.type) {
        case 'header': out.push(`${tag}## ${t}`); break
        case 'sub_header': out.push(`${tag}### ${t}`); break
        case 'sub_sub_header': out.push(`${tag}#### ${t}`); break
        case 'header_4': out.push(`${tag}##### ${t}`); break
        case 'bulleted_list': out.push(`${pad}${tag}- ${t}`); break
        case 'toggle': out.push(`${pad}${tag}▸ ${t}`); break
        case 'numbered_list': out.push(`${pad}${tag}${n}. ${t}`); break
        case 'to_do': out.push(`${pad}${tag}- [${b.properties.checked ? 'x' : ' '}] ${t}`); break
        case 'quote': out.push(`${pad}${tag}> ${t}`); break
        case 'callout': out.push(`${pad}${tag}> ${b.format.icon ?? '💡'} ${t}`); break
        case 'divider': out.push(`${tag}---`); break
        case 'code': out.push(`${tag}\`\`\`${b.format.code_language ?? ''}`, t, '```'); break
        case 'page': out.push(`${pad}${tag}[${b.schema ? 'Database' : 'Sub-page'}: ${t || 'Untitled'}]`); break
        case 'image': out.push(`${pad}${tag}![${htmlToPlain(b.properties.caption ?? '')}](${b.properties.url ?? ''})`); break
        case 'bookmark':
        case 'embed':
        case 'video': out.push(`${pad}${tag}[${b.type}: ${b.properties.url ?? '(empty)'}]`); break
        case 'table_of_contents': out.push(`${pad}${tag}[Table of contents]`); break
        case 'column_list': out.push(`${pad}${tag}[Columns]`); break
        case 'column': out.push(`${pad}${tag}[Column]`); break
        case 'table': {
          const rows = b.content.map((r) => blocks[r]).filter((r) => r?.alive)
          out.push(`${pad}${tag}[Table]`)
          rows.forEach((r, i) => {
            out.push(`${pad}| ${(r.properties.row ?? []).map((c) => htmlToInlineMarkdown(c)).join(' | ')} |`)
            if (i === 0) out.push(`${pad}|${' --- |'.repeat(r.properties.row?.length ?? 1)}`)
          })
          continue
        }
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
