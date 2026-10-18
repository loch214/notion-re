// Syntax colouring for code blocks using the CSS Custom Highlight API: the text stays plain
// (so editing is untouched); we only tell the browser which character ranges to colour.

const KEYWORDS =
  'abstract as async await break case catch class const continue def default del do elif else enum except export extends false finally fn for from func function if impl import in interface is lambda let loop match mod mut new nil none null of package pass private protected pub public raise return self static struct super switch this throw trait true try type typeof use var void while with yield select insert update delete create table where join group order by limit values and or not int string bool float double char long echo fi then done'
const WORDS = new Set(KEYWORDS.split(' '))
const HASH_COMMENT = new Set(['python', 'bash', 'ruby', 'yaml', 'powershell'])

const tokenRe = (lang: string) => {
  const comment = HASH_COMMENT.has(lang)
    ? '#[^\\n]*'
    : lang === 'sql'
      ? '--[^\\n]*'
      : lang === 'html'
        ? '<!--[\\s\\S]*?-->'
        : lang === 'json'
          ? '(?!)'
          : '//[^\\n]*|/\\*[\\s\\S]*?\\*/'
  const str = '"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`'
  return new RegExp(`(${comment})|(${str})|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_][A-Za-z0-9_]*)`, 'g')
}

type Reg = Map<string, Range[]>
const registry = new Map<string, Reg>()
const NAMES = ['comment', 'string', 'number', 'keyword']

function rebuild() {
  if (!('highlights' in CSS)) return
  for (const n of NAMES) {
    const h = new Highlight()
    for (const reg of registry.values()) for (const r of reg.get(n) ?? []) h.add(r)
    CSS.highlights.set(`tok-${n}`, h)
  }
}

/** Colour the code inside `el` (plain text, possibly split over several text nodes). */
export function highlightCode(blockId: string, el: HTMLElement, lang: string) {
  if (!('highlights' in CSS)) return
  const nodes: { node: Text; start: number }[] = []
  let text = ''
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, start: text.length })
    text += n.textContent
  }
  const at = (off: number) => {
    for (let i = nodes.length - 1; i >= 0; i--) if (off >= nodes[i].start) return { node: nodes[i].node, offset: off - nodes[i].start }
    return null
  }
  const reg: Reg = new Map(NAMES.map((n) => [n, []]))
  if (lang && lang !== 'plain text' && text.length < 30000) {
    const re = tokenRe(lang)
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const kind = m[1] ? 'comment' : m[2] ? 'string' : m[3] ? 'number' : WORDS.has(m[4].toLowerCase()) ? 'keyword' : ''
      if (!kind) continue
      const a = at(m.index)
      const b = at(m.index + m[0].length - 1)
      if (!a || !b) continue
      const r = new Range()
      r.setStart(a.node, a.offset)
      r.setEnd(b.node, b.offset + 1)
      reg.get(kind)!.push(r)
    }
  }
  registry.set(blockId, reg)
  rebuild()
}

export function clearCodeHighlight(blockId: string) {
  if (registry.delete(blockId)) rebuild()
}
