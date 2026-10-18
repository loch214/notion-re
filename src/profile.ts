// The owner's display name (shown in the sidebar and Settings → Account). Kept in this browser.

import { useSyncExternalStore } from 'react'

const KEY = 'notion-re:profile-name'
const listeners = new Set<() => void>()

export const getProfileName = () => localStorage.getItem(KEY) ?? ''

export function setProfileName(name: string) {
  localStorage.setItem(KEY, name)
  listeners.forEach((l) => l())
}

export function useProfileName() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getProfileName,
  )
}

export const initials = (name: string) => (name.trim()[0] ?? 'N').toUpperCase()
