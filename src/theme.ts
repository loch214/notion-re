// Light / dark theme, like Notion's Settings → Theme ("Use system setting", "Light", "Dark").
// The resolved theme lives on <html data-theme="light|dark">; all CSS keys off that attribute.
// index.html sets it before first paint so there's no flash.

import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'notion-re:theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function resolvedTheme(): 'light' | 'dark' {
  const p = getThemePref()
  return p === 'system' ? (media.matches ? 'dark' : 'light') : p
}

function apply() {
  document.documentElement.dataset.theme = resolvedTheme()
  listeners.forEach((l) => l())
}

export function setThemePref(p: ThemePref) {
  if (p === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, p)
  apply()
}

/** Ctrl+Shift+L in Notion: flip between light and dark (leaves "system" mode). */
export function toggleTheme() {
  setThemePref(resolvedTheme() === 'dark' ? 'light' : 'dark')
}

media.addEventListener('change', apply)
window.addEventListener('storage', (e) => e.key === KEY && apply())
apply()

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getThemePref,
  )
}
