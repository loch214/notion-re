# Notion(RE)

A Notion-style workspace rebuilt from scratch after studying how Notion works, using AI
reverse-engineering tools. Local-first, and the AI runs on **your own** provider instead of a
paid built-in AI service.

> ⚠️ **Showcase only — all rights reserved.** This repository has no open-source license.
> You may view the code, but you may not use, copy, modify or redistribute it.
> Some core modules are intentionally not included, so the project does not build from this repo.

## What it does

- **Block editor**: text, headings, bulleted / numbered lists, to-dos, toggles, quotes,
  callouts, code blocks, dividers, sub-pages
- **Notion-style editing**: `/` command menu, Markdown shortcuts (`#`, `-`, `1.`, `[]`, `>`, `"`,
  ```` ``` ````, `---`), Enter/Backspace splitting & merging, `Tab` / `Shift+Tab` nesting,
  drag-to-reorder, turn-into, duplicate
- **Pages**: nested page tree in the sidebar, icons, covers, breadcrumbs, search (`Ctrl+K`),
  trash with restore
- **Bring-your-own AI**: Anthropic (Claude), OpenAI, Google Gemini, or any OpenAI-compatible
  endpoint (OpenRouter, Groq, Ollama…)
  - Press `Space` on an empty line (or `/ai`) to have AI write into the page
  - AI side panel (`Ctrl+J`) to chat about the current page and insert answers
  - Responses stream in live; keys are stored only in the browser
- **Claude integration (MCP)**: connect Notion(RE) to Claude Desktop or Claude Code and let
  Claude manage your workspace on your existing Claude subscription — no API key needed.
  Claude can list, read, search, create, edit and delete pages and blocks, and its changes
  appear live in the open app.
- **Local-first**: the workspace is a file on your own computer, synced live to every open
  tab — no account, no cloud. Falls back to browser storage when run without the local server.
- Light & dark mode

## How it was made

See [HOW-IT-WAS-MADE.md](HOW-IT-WAS-MADE.md) — the reverse-engineering process with
[REA](https://github.com/morluto/rea), Claude Code and Claude in Chrome.

## Tech

React 19 · TypeScript · Vite · Zustand · Model Context Protocol (MCP)

---

Not affiliated with, endorsed by, or connected to Notion Labs, Inc. "Notion" is a trademark
of Notion Labs, Inc. No Notion source code is included in this project.

© 2026 loch214. All rights reserved.
