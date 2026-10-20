// Send a prompt to the AI panel from anywhere (page menu "Use with AI", block menu, sidebar "New chat"):
// the app opens the panel, and the panel picks the prompt up and sends it.

let pending: { prompt: string; fresh: boolean } | null = null

export const ASK_AI_EVENT = 'notion-re:ask-ai'

/** An empty prompt just opens the panel (in a new chat when `fresh`). A prompt always starts a new chat. */
// The block you were last in, so the AI chat can take it as context (Notion's selected-block chip).
let lastBlock: { id: string; at: number } | null = null
document.addEventListener('focusin', (e) => {
  const el = (e.target as HTMLElement | null)?.closest?.('[data-block-id]')
  if (el && !el.closest('.ai-dock')) lastBlock = { id: el.getAttribute('data-block-id')!, at: Date.now() }
})
// The caret / selection too (focus events don't fire while the window itself isn't focused).
document.addEventListener('selectionchange', () => {
  const node = getSelection()?.anchorNode
  const el = (node instanceof Element ? node : node?.parentElement)?.closest('[data-block-id]')
  if (el && !el.closest('.ai-dock')) lastBlock = { id: el.getAttribute('data-block-id')!, at: Date.now() }
})
/** The block focused within the last minute, if any. */
export const recentBlock = () => (lastBlock && Date.now() - lastBlock.at < 60_000 ? lastBlock.id : null)

export function askAI(prompt: string, fresh = !!prompt) {
  pending = { prompt, fresh }
  window.dispatchEvent(new Event(ASK_AI_EVENT))
}

export function takePendingPrompt() {
  const p = pending
  pending = null
  return p
}
