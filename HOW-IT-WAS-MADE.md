# How Notion(RE) was made

An experiment: can an AI coding agent study a real, complex app and rebuild a working
version of it?

## Tools

- **[Claude Code](https://claude.com/claude-code)** — the AI agent doing the analysis and writing the code
- **[REA (Reverse Engineer Anything)](https://github.com/morluto/rea)** — an analysis toolkit
  that lets agents inspect apps, from JavaScript bundles down to native binaries
- **Claude in Chrome** — lets the agent drive a real browser to observe a running web app

## Process

1. **Test the toolkit.** REA was first run on a small test app with a hidden network call
   and an obfuscated URL. It located the call precisely and reported what it couldn't resolve
   statically — the agent then filled in the gap.
2. **Observe the real app.** Using Claude in Chrome, the agent opened the Notion web app and
   looked at how it behaves: what it loads, how it stores data in the browser, how it talks
   to its servers, and how a page is structured.
3. **Write down the design.** The key findings, at a high level:
   - *Everything is a block.* Pages, paragraphs, headings and list items are all the same kind
     of record, linked into a tree (each block knows its parent and its ordered children).
   - *Local-first.* Edits are saved on the device first and synced in the background, which is
     why the app feels instant.
   - *Soft delete.* Deleted things are flagged rather than erased, which makes trash and undo easy.
   - *Huge, split-up front-end.* The app loads hundreds of small code chunks on demand.
4. **Rebuild from the design, not the code.** Notion(RE) is written from scratch. It copies the
   *ideas* (block tree, local-first saving, slash menu, Markdown shortcuts), not Notion's code.
5. **Change what we wanted to change.** The built-in paid AI is replaced with a direct
   connection to the user's own AI provider.

## Result

A working Notion-style editor built in a single session — see the [README](README.md) for the
feature list.

The detailed internal notes from step 2 are kept private.
