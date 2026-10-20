// Number formats and the table's "Calculate" row (Notion's column aggregations).

import { cellRaw } from './blocks.ts'
import { daysBetween, endDay, formatDay, startDay } from './dates.ts'
import type { Block, CalcFn, DbProperty, NumberFormat } from '../src/types'

export const NUMBER_FORMATS: { value: NumberFormat; label: string; currency?: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'number_with_commas', label: 'Number with commas' },
  { value: 'percent', label: 'Percent' },
  { value: 'dollar', label: 'US dollar', currency: 'USD' },
  { value: 'canadian_dollar', label: 'Canadian dollar', currency: 'CAD' },
  { value: 'australian_dollar', label: 'Australian dollar', currency: 'AUD' },
  { value: 'euro', label: 'Euro', currency: 'EUR' },
  { value: 'pound', label: 'Pound', currency: 'GBP' },
  { value: 'yen', label: 'Yen', currency: 'JPY' },
  { value: 'yuan', label: 'Yuan', currency: 'CNY' },
  { value: 'won', label: 'Won', currency: 'KRW' },
  { value: 'rupee', label: 'Rupee', currency: 'INR' },
  { value: 'sri_lankan_rupee', label: 'Sri Lankan rupee', currency: 'LKR' },
  { value: 'franc', label: 'Franc', currency: 'CHF' },
]

/** A number as the column shows it (percent: 0.5 → 50%, like Notion). */
export function formatNumber(n: number, prop?: Pick<DbProperty, 'number_format'>): string {
  const fmt = NUMBER_FORMATS.find((f) => f.value === prop?.number_format)
  if (!fmt || fmt.value === 'number') return String(Math.round(n * 1e10) / 1e10)
  if (fmt.value === 'number_with_commas') return n.toLocaleString('en-US', { maximumFractionDigits: 10 })
  if (fmt.value === 'percent') return n.toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 8 })
  return n.toLocaleString('en-US', { style: 'currency', currency: fmt.currency })
}

/** Read a typed number back, ignoring commas, currency signs and a trailing % (which divides by 100). */
export function parseNumber(text: string, prop?: Pick<DbProperty, 'number_format'>): number | null {
  const t = text.trim()
  if (!t) return null
  const n = parseFloat(t.replace(/[^\d.eE+-]/g, ''))
  if (Number.isNaN(n)) return null
  return prop?.number_format === 'percent' && t.endsWith('%') ? n / 100 : n
}

const ALL: { value: CalcFn; label: string; short: string }[] = [
  { value: 'count_all', label: 'Count all', short: 'Count' },
  { value: 'count_values', label: 'Count values', short: 'Values' },
  { value: 'count_unique', label: 'Count unique values', short: 'Unique' },
  { value: 'count_empty', label: 'Count empty', short: 'Empty' },
  { value: 'count_not_empty', label: 'Count not empty', short: 'Not empty' },
  { value: 'percent_empty', label: 'Percent empty', short: 'Empty' },
  { value: 'percent_not_empty', label: 'Percent not empty', short: 'Not empty' },
]
const NUMBER: typeof ALL = [
  { value: 'sum', label: 'Sum', short: 'Sum' },
  { value: 'average', label: 'Average', short: 'Average' },
  { value: 'median', label: 'Median', short: 'Median' },
  { value: 'min', label: 'Min', short: 'Min' },
  { value: 'max', label: 'Max', short: 'Max' },
  { value: 'range', label: 'Range', short: 'Range' },
]
const DATE: typeof ALL = [
  { value: 'earliest_date', label: 'Earliest date', short: 'Earliest' },
  { value: 'latest_date', label: 'Latest date', short: 'Latest' },
  { value: 'date_range', label: 'Date range', short: 'Range' },
]
const CHECKBOX: typeof ALL = [
  { value: 'count_all', label: 'Count all', short: 'Count' },
  { value: 'checked', label: 'Checked', short: 'Checked' },
  { value: 'unchecked', label: 'Unchecked', short: 'Unchecked' },
  { value: 'percent_checked', label: 'Percent checked', short: 'Checked' },
  { value: 'percent_unchecked', label: 'Percent unchecked', short: 'Unchecked' },
]

/** Calculations offered for a column, grouped like Notion's menu (Count / More options). */
export function calcOptions(prop: DbProperty): typeof ALL {
  if (prop.type === 'checkbox') return CHECKBOX
  if (prop.type === 'number') return [...ALL, ...NUMBER]
  if (prop.type === 'date' || prop.type === 'created_time' || prop.type === 'last_edited_time') return [...ALL, ...DATE]
  return ALL
}

export const calcLabel = (prop: DbProperty, fn: CalcFn) => calcOptions(prop).find((o) => o.value === fn)

const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 1000) / 10 : 0}%`

/** The value shown in the Calculate row for one column over the view's rows. */
export function calculate(fn: CalcFn, prop: DbProperty, rows: Block[]): string {
  const raw = rows.map((r) => cellRaw(prop, r))
  const filled = raw.filter((v) => !(v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length)))
  const keys = (v: unknown) => (Array.isArray(v) ? v.map(String) : [prop.type === 'title' ? String(v).trim() : String(v)])
  const nums = raw.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
  const num = (n: number) => formatNumber(n, prop)
  const days = filled.flatMap((v) => [startDay(v), endDay(v)]).filter((d): d is string => !!d).sort()
  const total = rows.length
  switch (fn) {
    case 'count_all': return String(total)
    case 'count_values': return String(filled.reduce((n: number, v) => n + (Array.isArray(v) ? v.length : 1), 0))
    case 'count_unique': return String(new Set(filled.flatMap(keys)).size)
    case 'count_empty': case 'unchecked': return String(total - filled.length)
    case 'count_not_empty': case 'checked': return String(filled.length)
    case 'percent_empty': case 'percent_unchecked': return pct(total - filled.length, total)
    case 'percent_not_empty': case 'percent_checked': return pct(filled.length, total)
    case 'sum': return num(nums.reduce((a, b) => a + b, 0))
    case 'average': return nums.length ? num(nums.reduce((a, b) => a + b, 0) / nums.length) : ''
    case 'median': {
      if (!nums.length) return ''
      const m = nums.length >> 1
      return num(nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2)
    }
    case 'min': return nums.length ? num(nums[0]) : ''
    case 'max': return nums.length ? num(nums[nums.length - 1]) : ''
    case 'range': return nums.length ? num(nums[nums.length - 1] - nums[0]) : ''
    case 'earliest_date': return days.length ? formatDay(days[0], prop.date_format ?? 'short') : ''
    case 'latest_date': return days.length ? formatDay(days[days.length - 1], prop.date_format ?? 'short') : ''
    case 'date_range': {
      if (!days.length) return ''
      const d = daysBetween(days[0], days[days.length - 1])
      return d >= 60 ? `${Math.round(d / 30.44)} months` : `${d} day${d === 1 ? '' : 's'}`
    }
    default: return ''
  }
}
