import { useState } from 'react'
import { Icon } from './Icons'
import { Popover } from './Database'

/** Notion-style select: a quiet button with the current value and a chevron, opening a menu. */
export function Dropdown<T extends string>({ value, options, onChange, width = 240 }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; width?: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const current = options.find((o) => o.value === value)
  return (
    <>
      <button className="dropdown-btn" onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}>
        <span>{current?.label ?? '—'}</span>
        <Icon name="down" size={12} />
      </button>
      {rect && (
        <Popover anchor={rect} onClose={() => setRect(null)} width={width}>
          {options.map((o) => (
            <div
              key={o.value}
              className="menu-item compact"
              onClick={() => {
                onChange(o.value)
                setRect(null)
              }}
            >
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.value === value && <Icon name="check" size={14} />}
            </div>
          ))}
        </Popover>
      )}
    </>
  )
}

/** On/off switch (Notion's toggle). */
export function Switch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return <button role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
}
