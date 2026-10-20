// Home: Notion's start screen — greeting, "Recently visited" cards, "Upcoming events" and
// "My tasks" (open tasks from every database with a Status column). Data from shared/home.ts.

import { coverCss } from '../../shared/blocks.ts'
import { formatDay, formatTime, parseDate, startDay, todayIso, addDays } from '../../shared/dates'
import { doneOptionIds, openTasks, taskDatabases, upcoming, type TaskItem } from '../../shared/home'
import { Avatar, useProfileName } from '../profile'
import { pageTitle, useStore } from '../store'
import { readRecents } from './Sidebar'
import { Icon, PlusIcon } from './Icons'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Card dates like Notion's: "Just now", "5m ago", "1h ago" today, then "May 18". */
const shortDate = (ms: number) => {
  const min = Math.floor((Date.now() - ms) / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  if (min < 24 * 60 && new Date(ms).toDateString() === new Date().toDateString()) return `${Math.floor(min / 60)}h ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function Home() {
  const blocks = useStore((s) => s.blocks)
  const name = useProfileName()
  const S = useStore.getState
  const recents = readRecents().filter((id) => blocks[id]?.alive && blocks[id].type === 'page').slice(0, 8)
  const events = upcoming(blocks, 14).slice(0, 12)
  const tasks = openTasks(blocks).slice(0, 10)
  const taskDbs = taskDatabases(blocks)
  const today = todayIso()

  const dayLabel = (d: string) => (d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : formatDay(d, 'relative'))
  const byDay: [string, typeof events][] = []
  for (const e of events) {
    const last = byDay.at(-1)
    if (last && last[0] === e.day) last[1].push(e)
    else byDay.push([e.day, [e]])
  }

  const complete = (t: TaskItem) => {
    if (t.task.status) S().setCell(t.row.id, t.task.status.id, doneOptionIds(t.task.status)[0] ?? null)
    else if (t.task.doneCheckbox) S().setCell(t.row.id, t.task.doneCheckbox.id, true)
  }

  return (
    <div className="home">
      <h1 className="home-greeting">{greeting()}{name ? `, ${name.split(' ')[0]}` : ''}</h1>

      <section className="home-section">
        <div className="home-label"><Icon name="clock" size={14} /> Recently visited</div>
        <div className="home-recents">
          {recents.map((id) => {
            const p = blocks[id]
            return (
              <button key={id} className="home-card" onClick={() => S().openPage(id)}>
                <span className="home-card-cover" style={{ background: coverCss(p.format.cover) ?? (p.format.background ? `var(--bg-${p.format.background})` : undefined) }} />
                <span className="home-card-icon">{p.format.icon ?? <Icon name="page" size={26} />}</span>
                <span className="home-card-title">{pageTitle(p)}</span>
                <span className="home-card-meta">
                  <Avatar className="tiny" />
                  {shortDate(p.last_edited_time)}
                </span>
              </button>
            )
          })}
          <button className="home-card new" onClick={() => S().createPage(null)}>
            <span className="home-card-cover" />
            <span className="home-card-icon"><PlusIcon size={20} /></span>
            <span className="home-card-title muted">New page</span>
          </button>
        </div>
      </section>

      <section className="home-section">
        <div className="home-label"><Icon name="calendar" size={14} /> Upcoming events</div>
        <div className="home-panel">
          {byDay.length === 0 ? (
            <div className="home-empty">
              <Icon name="calendar" size={28} />
              <div>No upcoming events</div>
              <div className="muted">Dates from your databases in the next two weeks show up here.</div>
            </div>
          ) : (
            byDay.map(([day, list]) => (
              <div key={day} className="home-day">
                <div className="home-day-label">
                  <b>{dayLabel(day)}</b>
                  <span>{new Date(day + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="home-day-items">
                  {list.map((e) => {
                    const p = parseDate(e.value)!
                    const time = p.startTime && p.start === e.day ? formatTime(p.startTime, e.prop.time_format) : p.end && p.end !== p.start ? 'All day' : ''
                    return (
                      <button key={e.row.id + e.prop.id} className="home-event" onClick={() => S().openPage(e.row.id)}>
                        <span className="home-event-bar" />
                        <span className="home-event-text">
                          <span className="home-event-title">{e.row.format.icon ? `${e.row.format.icon} ` : ''}{pageTitle(e.row)}</span>
                          <span className="home-event-meta">{[time, `${e.db.format.icon ?? ''} ${pageTitle(e.db)}`.trim()].filter(Boolean).join(' · ')}</span>
                        </span>
                        {e.row.properties.reminders?.[e.prop.id] !== undefined && <Icon name="bell" size={13} className="date-bell" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="home-section">
        <div className="home-label"><Icon name="checkCircle" size={14} /> My tasks</div>
        <div className="home-panel tasks">
          {tasks.length === 0 ? (
            <div className="home-empty">
              <Icon name="checkCircle" size={28} />
              <div>{taskDbs.length ? 'No open tasks' : 'No task database yet'}</div>
              <div className="muted">{taskDbs.length ? 'Tasks you haven’t finished show up here.' : 'Add a Tasks tracker from Templates to see your tasks here.'}</div>
            </div>
          ) : (
            tasks.map((t) => {
              const due = startDay(t.due)
              const late = due && due < today
              return (
                <div key={t.row.id} className="home-task" onClick={() => S().openPage(t.row.id)}>
                  <button className="home-task-check" title="Mark as done" onClick={(e) => { e.stopPropagation(); complete(t) }} />
                  <span className="home-task-title">{t.row.format.icon ? `${t.row.format.icon} ` : ''}{pageTitle(t.row)}</span>
                  {due && <span className={`home-task-due ${late ? 'late' : ''}`}>{formatDay(due, 'relative')}</span>}
                  <span className="home-task-db">{pageTitle(t.task.db)}</span>
                </div>
              )
            })
          )}
          {taskDbs.length > 0 && (
            <button className="home-task-new" onClick={() => S().openPage(S().addRow(taskDbs[0].db.id, ''))}>
              <PlusIcon size={13} /> New task
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
