// Send a prompt to the AI panel from anywhere (page menu "Use with AI", block menu, sidebar "New chat"):
// the app opens the panel, and the panel picks the prompt up and sends it.

let pending: { prompt: string; fresh: boolean } | null = null

export const ASK_AI_EVENT = 'notion-re:ask-ai'

/** An empty prompt just opens the panel (in a new chat when `fresh`). A prompt always starts a new chat. */
export function askAI(prompt: string, fresh = !!prompt) {
  pending = { prompt, fresh }
  window.dispatchEvent(new Event(ASK_AI_EVENT))
}

export function takePendingPrompt() {
  const p = pending
  pending = null
  return p
}
