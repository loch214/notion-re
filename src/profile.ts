// The owner's profile (shown in the sidebar, Home and Settings → Account): name, email and photo,
// set by hand — the app runs on this computer only, so there is no sign-in. Kept in this browser.

import { createElement, useSyncExternalStore } from 'react'

export interface Profile {
  name: string
  email: string
  /** Small square picture as a data: URL (resized when chosen). */
  photo: string
}

const KEY = 'notion-re:profile'
const OLD_NAME_KEY = 'notion-re:profile-name'
const listeners = new Set<() => void>()

let cache: Profile | null = null
function read(): Profile {
  if (cache) return cache
  let p: Partial<Profile> = {}
  try {
    p = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {}
  cache = { name: p.name ?? localStorage.getItem(OLD_NAME_KEY) ?? '', email: p.email ?? '', photo: p.photo ?? '' }
  return cache
}

export const getProfile = read
export const getProfileName = () => read().name

export function setProfile(patch: Partial<Profile>) {
  cache = { ...read(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(cache))
  listeners.forEach((l) => l())
}

export const setProfileName = (name: string) => setProfile({ name })

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useProfile = () => useSyncExternalStore(subscribe, read)
export const useProfileName = () => useProfile().name

export const initials = (name: string) => (name.trim()[0] ?? 'N').toUpperCase()

/** Resize a chosen picture to a 160 px square (cropped to the middle) so it fits in browser storage. */
export function photoFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const size = 160
      const c = document.createElement('canvas')
      c.width = c.height = size
      const s = Math.min(img.width, img.height)
      c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/** The owner's round avatar: their photo, or the first letter of their name. */
export function Avatar({ className = '' }: { className?: string }) {
  const p = useProfile()
  return p.photo
    ? createElement('img', { className: `avatar ${className}`, src: p.photo, alt: '' })
    : createElement('span', { className: `avatar ${className}` }, initials(p.name))
}
