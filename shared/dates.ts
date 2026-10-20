// Date values, formats, relative filters and reminders, shared by the app and the MCP server.
// A date cell is one string: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm", optionally followed by
// "/" and an end in the same form (ISO 8601 interval), e.g. "2026-10-18T09:00/2026-10-18T10:30".
// Behaviour follows Notion's date property (end date, include time, date / time format, remind).

import type { DbProperty } from '../src/types'

export interface DateParts {
  start: string
  startTime?: string
  end?: string
  endTime?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayIso = () => isoDay(new Date())

export function addDays(day: string, n: number): string {
  const d = toDate(day)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

/** Local midnight of "YYYY-MM-DD" (plus an optional "HH:mm"). */
export function toDate(day: string, time?: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = (time ?? '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, h || 0, min || 0)
}

const ONE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

export function isDateValue(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const [a, b, extra] = v.split('/')
  return ONE.test(a) && (b === undefined || ONE.test(b)) && extra === undefined
}

export function parseDate(v: unknown): DateParts | null {
  if (!isDateValue(v)) return null
  const [a, b] = v.split('/')
  const [start, startTime] = a.split('T')
  const out: DateParts = { start, startTime }
  if (b) {
    const [end, endTime] = b.split('T')
    out.end = end
    out.endTime = endTime
  }
  return out
}

export function joinDate(p: DateParts): string {
  const one = (d: string, t?: string) => (t ? `${d}T${t}` : d)
  return p.end ? `${one(p.start, p.startTime)}/${one(p.end, p.endTime)}` : one(p.start, p.startTime)
}

/** The day a date value starts on (for sorting, filters and calendars). */
export const startDay = (v: unknown) => parseDate(v)?.start ?? null
/** The last day a value covers (its end, or its start). */
export const endDay = (v: unknown) => {
  const p = parseDate(v)
  return p ? (p.end ?? p.start) : null
}

export type DateFormat = 'full' | 'short' | 'mdy' | 'dmy' | 'ymd' | 'relative'
export type TimeFormat = '12' | '24'

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'full', label: 'Full date' },
  { value: 'short', label: 'Short date' },
  { value: 'mdy', label: 'Month/Day/Year' },
  { value: 'dmy', label: 'Day/Month/Year' },
  { value: 'ymd', label: 'Year/Month/Day' },
  { value: 'relative', label: 'Relative' },
]

export function formatDay(day: string, fmt: DateFormat = 'full'): string {
  const d = toDate(day)
  const [y, m, dd] = day.split('-')
  switch (fmt) {
    case 'short': return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    case 'mdy': return `${m}/${dd}/${y}`
    case 'dmy': return `${dd}/${m}/${y}`
    case 'ymd': return `${y}/${m}/${dd}`
    case 'relative': {
      const diff = Math.round((toDate(day).getTime() - toDate(todayIso()).getTime()) / 86400000)
      if (diff === 0) return 'Today'
      if (diff === 1) return 'Tomorrow'
      if (diff === -1) return 'Yesterday'
      if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
      if (diff < -1 && diff > -7) return `Last ${d.toLocaleDateString('en-US', { weekday: 'long' })}`
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }
    default: return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
}

export function formatTime(time: string, fmt: TimeFormat = '12'): string {
  const [h, m] = time.split(':').map(Number)
  if (fmt === '24') return `${pad(h)}:${pad(m)}`
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

/** "October 18, 2026 9:00 AM → 10:30 AM", like Notion's date cells. */
export function formatDateValue(v: unknown, prop?: Pick<DbProperty, 'date_format' | 'time_format'>): string {
  const p = parseDate(v)
  if (v === '@today') return 'Today (when used)'
  if (!p) return typeof v === 'string' ? v : ''
  const df = prop?.date_format ?? 'full'
  const tf = prop?.time_format ?? '12'
  const one = (d: string, t?: string) => formatDay(d, df) + (t ? ` ${formatTime(t, tf)}` : '')
  if (!p.end) return one(p.start, p.startTime)
  if (p.end === p.start && p.endTime) return `${one(p.start, p.startTime)} → ${formatTime(p.endTime, tf)}`
  return `${one(p.start, p.startTime)} → ${one(p.end, p.endTime)}`
}

// ── Relative dates in filters (Notion: "Today", "One week ago", "Is within: Past week") ──

export const RELATIVE_DAYS: { value: string; label: string; days: number; months?: number }[] = [
  { value: 'today', label: 'Today', days: 0 },
  { value: 'tomorrow', label: 'Tomorrow', days: 1 },
  { value: 'yesterday', label: 'Yesterday', days: -1 },
  { value: 'one_week_ago', label: 'One week ago', days: -7 },
  { value: 'one_week_from_now', label: 'One week from now', days: 7 },
  { value: 'one_month_ago', label: 'One month ago', days: 0, months: -1 },
  { value: 'one_month_from_now', label: 'One month from now', days: 0, months: 1 },
]

/** A filter's date: an exact "YYYY-MM-DD", or a relative word resolved against today. */
export function resolveDay(want: unknown): string | null {
  if (typeof want !== 'string') return null
  const rel = RELATIVE_DAYS.find((r) => r.value === want)
  if (!rel) return startDay(want)
  const d = new Date()
  d.setMonth(d.getMonth() + (rel.months ?? 0))
  d.setDate(d.getDate() + rel.days)
  return isoDay(d)
}

export const WITHIN: { value: string; label: string }[] = [
  { value: 'past_week', label: 'Past week' },
  { value: 'past_month', label: 'Past month' },
  { value: 'past_year', label: 'Past year' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'next_week', label: 'Next week' },
  { value: 'next_month', label: 'Next month' },
  { value: 'next_year', label: 'Next year' },
]

/** First and last day of a "within" range; weeks start on Sunday unless `mondayFirst`. */
export function withinRange(range: string, mondayFirst = weekStartsMonday()): [string, string] | null {
  const t = todayIso()
  const d = new Date()
  switch (range) {
    case 'past_week': return [addDays(t, -7), t]
    case 'next_week': return [t, addDays(t, 7)]
    case 'past_month': { d.setMonth(d.getMonth() - 1); return [isoDay(d), t] }
    case 'next_month': { d.setMonth(d.getMonth() + 1); return [t, isoDay(d)] }
    case 'past_year': { d.setFullYear(d.getFullYear() - 1); return [isoDay(d), t] }
    case 'next_year': { d.setFullYear(d.getFullYear() + 1); return [t, isoDay(d)] }
    case 'this_week': {
      const first = addDays(t, -((d.getDay() + (mondayFirst ? 6 : 0)) % 7))
      return [first, addDays(first, 6)]
    }
    case 'this_month': {
      const first = new Date(d.getFullYear(), d.getMonth(), 1)
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return [isoDay(first), isoDay(last)]
    }
    default: return null
  }
}

/** Settings → Preferences → "Start week on Monday" (browser only; the server uses Sunday). */
export function weekStartsMonday(): boolean {
  try {
    return globalThis.localStorage?.getItem('notion-re:week-monday') === '1'
  } catch {
    return false
  }
}

// ── Reminders (Notion's "Remind" on a date) ──
// Stored per row as properties.reminders[propertyId] = minutes before the start. Dates without a
// time are reminded relative to 9:00 AM on the day, like Notion's "On day of event (9:00 AM)".

export const REMIND_DAY: { value: number; label: string }[] = [
  { value: 0, label: 'On day of event (9:00 AM)' },
  { value: 1440, label: '1 day before (9:00 AM)' },
  { value: 2880, label: '2 days before (9:00 AM)' },
  { value: 10080, label: '1 week before (9:00 AM)' },
]

export const REMIND_TIME: { value: number; label: string }[] = [
  { value: 0, label: 'At time of event' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
]

export function remindLabel(minutes: number | undefined, timed: boolean): string {
  if (minutes === undefined) return 'None'
  return (timed ? REMIND_TIME : REMIND_DAY).find((r) => r.value === minutes)?.label ?? `${minutes} minutes before`
}

/** When a reminder fires (ms), or null for a value that isn't a date. */
export function remindAt(v: unknown, minutes: number): number | null {
  const p = parseDate(v)
  if (!p) return null
  return toDate(p.start, p.startTime ?? '09:00').getTime() - minutes * 60000
}

/** Moves a date value so it starts on `day`, keeping its times and its length (calendar drag). */
export function moveDate(v: unknown, day: string): string {
  const p = parseDate(v)
  if (!p) return day
  if (!p.end) return joinDate({ ...p, start: day })
  const len = Math.round((toDate(p.end).getTime() - toDate(p.start).getTime()) / 86400000)
  return joinDate({ ...p, start: day, end: addDays(day, len) })
}

/** Timeline drag: move a whole value, or only its start / end, by `days` (an end is added when resizing). */
export function shiftDate(v: unknown, days: number, part: 'move' | 'start' | 'end'): string | null {
  const p = parseDate(v)
  if (!p) return null
  const end = p.end ?? p.start
  if (part === 'move') return joinDate({ ...p, start: addDays(p.start, days), ...(p.end ? { end: addDays(p.end, days) } : {}) })
  if (part === 'start') {
    const start = addDays(p.start, days)
    return joinDate(start > end ? { ...p, start: end, end: undefined } : { ...p, start, end, endTime: p.endTime ?? p.startTime })
  }
  const e = addDays(end, days)
  return joinDate(e <= p.start ? { ...p, end: undefined, endTime: undefined } : { ...p, end: e, endTime: p.endTime ?? p.startTime })
}

export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
