// Notion's date popup: date field(s), month grid, "End date" / "Include time" switches,
// date & time format, "Remind", "Clear". Values follow shared/dates.ts.

import { useState } from 'react'
import type { DbProperty } from '../types'
import {
  addDays, DATE_FORMATS, formatDateValue, formatDay, formatTime, isoDay, joinDate, parseDate, REMIND_DAY, REMIND_TIME, remindLabel,
  todayIso, toDate, weekStartsMonday, type DateParts,
} from '../../shared/dates'
import { Icon } from './Icons'
import { Popover } from './Database'

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={(e) => { e.stopPropagation(); onChange(!on) }}>
      <span />
    </button>
  )
}

interface Props {
  value: string | null
  onChange: (v: string | null) => void
  /** Date property: its display formats can be changed from the picker. */
  prop?: DbProperty
  onFormat?: (patch: Partial<DbProperty>) => void
  /** Rows only: the reminder (minutes before) and its setter. */
  remind?: number
  onRemind?: (m: number | undefined) => void
}

export function DatePicker({ value, onChange, prop, onFormat, remind, onRemind }: Props) {
  const parts = parseDate(value)
  const [month, setMonth] = useState(() => (parts?.start ?? todayIso()).slice(0, 7) + '-01')
  const [active, setActive] = useState<'start' | 'end'>('start')
  const [sub, setSub] = useState<'format' | 'remind' | null>(null)
  const timed = !!parts?.startTime
  const set = (p: DateParts | null) => onChange(p ? joinDate(p) : null)
  const base: DateParts = parts ?? { start: todayIso() }

  const pick = (day: string) => {
    if (!parts) return set({ start: day })
    if (parts.end && active === 'end') {
      if (day < parts.start) set({ ...parts, start: day, end: parts.start, endTime: parts.startTime, startTime: parts.endTime })
      else set({ ...parts, end: day })
      setActive('start')
    } else if (parts.end) {
      if (day > parts.end) set({ ...parts, start: parts.end, startTime: parts.endTime, end: day, endTime: parts.startTime })
      else set({ ...parts, start: day })
      setActive('end')
    } else set({ ...parts, start: day })
  }

  // Month grid: 6 weeks from the week that holds the 1st.
  const first = toDate(month)
  const shift = (first.getDay() - (weekStartsMonday() ? 1 : 0) + 7) % 7
  const gridStart = addDays(month, -shift)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const names = weekStartsMonday() ? [...DAY_NAMES.slice(1), DAY_NAMES[0]] : DAY_NAMES
  const moveMonth = (n: number) => setMonth(isoDay(new Date(first.getFullYear(), first.getMonth() + n, 1)))
  const today = todayIso()
  const lastDay = parts?.end ?? parts?.start

  const field = (which: 'start' | 'end') => {
    const d = which === 'start' ? parts?.start : parts?.end
    const t = which === 'start' ? parts?.startTime : parts?.endTime
    return (
      <div className={`dp-field ${parts?.end && active === which ? 'active' : ''}`} onClick={() => setActive(which)}>
        <span className="dp-field-date">{d ? formatDay(d, 'short') : ''}</span>
        {timed && d && (
          <input
            className="dp-time"
            type="time"
            value={t ?? '09:00'}
            onChange={(e) => e.target.value && set(which === 'start' ? { ...base, startTime: e.target.value } : { ...base, endTime: e.target.value })}
          />
        )}
      </div>
    )
  }

  // Submenus replace the picker body, with a back row (keeps the popup short).
  if (sub) {
    return (
      <div className="date-picker">
        <div className="menu-item compact dp-back" onClick={() => setSub(null)}>
          <Icon name="left" size={12} /> {sub === 'format' ? 'Date format & timezone' : 'Remind'}
        </div>
        <div className="menu-sep" />
        {sub === 'format' && prop && onFormat && (
          <div className="dp-sub">
            <label>Date format</label>
            <select value={prop.date_format ?? 'full'} onChange={(e) => onFormat({ date_format: e.target.value as DbProperty['date_format'] })}>
              {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <label>Time format</label>
            <select value={prop.time_format ?? '12'} onChange={(e) => onFormat({ time_format: e.target.value as DbProperty['time_format'] })}>
              <option value="12">12 hour</option>
              <option value="24">24 hour</option>
            </select>
          </div>
        )}
          {sub === 'remind' && onRemind && (
          <div className="dp-sub list">
            {[{ value: -1, label: 'None' }, ...(timed ? REMIND_TIME : REMIND_DAY)].map((r) => (
              <div
                key={r.value}
                className={`menu-item compact ${(remind ?? -1) === r.value ? 'active' : ''}`}
                onClick={() => {
                  if (!parts && r.value >= 0) set(base)
                  onRemind(r.value < 0 ? undefined : r.value)
                  setSub(null)
                }}
              >
                <span style={{ flex: 1 }}>{r.label}</span>
                {(remind ?? -1) === r.value && <Icon name="check" size={14} />}
              </div>
            ))}
          </div>
        )}
        </div>
    )
  }

  return (
    <div className="date-picker">
      <div className="dp-fields">
        {field('start')}
        {parts?.end && field('end')}
      </div>
      <div className="dp-head">
        <span className="dp-month">{first.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        <button className="dp-today" onClick={() => setMonth(today.slice(0, 7) + '-01')}>Today</button>
        <button className="ctl" title="Previous month" onClick={() => moveMonth(-1)}><Icon name="left" size={14} /></button>
        <button className="ctl" title="Next month" onClick={() => moveMonth(1)}><Icon name="right" size={14} /></button>
      </div>
      <div className="dp-grid">
        {names.map((n) => <span key={n} className="dp-dow">{n}</span>)}
        {days.map((d) => {
          const inRange = parts?.end && d >= parts.start && d <= parts.end
          const selected = d === parts?.start || d === lastDay
          return (
            <button
              key={d}
              className={`dp-day ${d.slice(0, 7) !== month.slice(0, 7) ? 'other' : ''} ${d === today ? 'today' : ''} ${selected ? 'selected' : ''} ${inRange ? 'range' : ''}`}
              onClick={() => pick(d)}
            >
              {Number(d.slice(8))}
            </button>
          )
        })}
      </div>
      <div className="menu-sep" />
      <div className="menu-item compact" onClick={() => set(parts?.end ? { start: base.start, startTime: base.startTime } : { ...base, end: base.start, endTime: base.startTime ? addHour(base.startTime) : undefined })}>
        <span style={{ flex: 1 }}>End date</span>
        <Switch on={!!parts?.end} onChange={() => {}} />
      </div>
      <div
        className="menu-item compact"
        onClick={() => set(timed ? { start: base.start, end: base.end } : { ...base, startTime: nextHalfHour(), endTime: base.end ? addHour(nextHalfHour()) : undefined })}
      >
        <span style={{ flex: 1 }}>Include time</span>
        <Switch on={timed} onChange={() => {}} />
      </div>
      {prop && onFormat && (
        <div className="menu-item compact" onClick={() => setSub('format')}>
          <span style={{ flex: 1 }}>Date format &amp; timezone</span>
          <Icon name="right" size={12} />
        </div>
      )}
      {onRemind && (
        <div className="menu-item compact" onClick={() => setSub('remind')}>
          <span style={{ flex: 1 }}>Remind</span>
          <span className="menu-hint">{remindLabel(remind, timed).replace(/ \(9:00 AM\)/, '')}</span>
          <Icon name="right" size={12} />
        </div>
      )}
      <div className="menu-sep" />
      <div className="menu-item compact" onClick={() => { onChange(null); onRemind?.(undefined) }}>Clear</div>
    </div>
  )
}

function nextHalfHour() {
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function addHour(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A date cell: the formatted value (with a bell when a reminder is set); click opens the picker. */
export function DateCell({ value, onChange, prop, onFormat, remind, onRemind, placeholder = 'Empty' }: Props & { placeholder?: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const p = parseDate(value)
  return (
    <>
      <button className={`date-cell ${p || value ? '' : 'empty'}`} onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}>
        {p || value ? formatDateValue(value, prop) : placeholder}
        {p && remind !== undefined && <Icon name="bell" size={13} className="date-bell" />}
      </button>
      {rect && (
        <Popover anchor={rect} onClose={() => setRect(null)} width={260} height={520}>
          <DatePicker value={value} onChange={onChange} prop={prop} onFormat={onFormat} remind={remind} onRemind={onRemind} />
        </Popover>
      )}
    </>
  )
}

