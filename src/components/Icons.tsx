// Small UI icons drawn as simple SVG shapes (our own drawings; sizes follow Notion's 16/20 px grid).

interface P {
  size?: number
  className?: string
}

/** Solid triangle pointing right; rotate 90° for "open". */
export function TriangleIcon({ size = 12, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className} aria-hidden fill="currentColor">
      <path d="M4 2.5 9 6l-5 3.5z" />
    </svg>
  )
}

/** Six-dot drag handle. */
export function DragIcon({ size = 14, className }: P) {
  return (
    <svg width={size * 0.72} height={size} viewBox="0 0 10 14" className={className} aria-hidden fill="currentColor">
      {[2, 7, 12].map((y) => (
        <g key={y}>
          <circle cx="2.5" cy={y} r="1.3" />
          <circle cx="7.5" cy={y} r="1.3" />
        </g>
      ))}
    </svg>
  )
}

export function PlusIcon({ size = 14, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M7 2v10M2 7h10" />
    </svg>
  )
}

/** Outline icons on a 20 px grid (our own simple drawings, Notion-like weight). */
const PATHS = {
  search: 'M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12.2 12.2l4.3 4.3',
  home: 'M3.5 9 10 3.5 16.5 9v7a.5.5 0 0 1-.5.5h-3.5v-5h-5v5H4a.5.5 0 0 1-.5-.5Z',
  sparkle: 'M10 2.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5ZM15.5 13c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z',
  gear: 'M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM8.6 2.5h2.8l.4 2 1.6.9 1.9-.7 1.4 2.4-1.5 1.4v1.9l1.5 1.3-1.4 2.5-1.9-.7-1.6.9-.4 2.1H8.6l-.4-2.1-1.6-.9-1.9.7-1.4-2.5 1.5-1.3V8.5L3.3 7.1l1.4-2.4 1.9.7 1.6-.9Z',
  trash: 'M3.5 5.5h13M8 5.5v-2h4v2M5 5.5l.8 11h8.4l.8-11M8.3 8.5v5.5M11.7 8.5v5.5',
  import: 'M10 3v9.5M6 8.5l4 4 4-4M3.5 13.5v3h13v-3',
  sidebar: 'M3.5 4.5h13v11h-13ZM8 4.5v11',
  compose: 'M15.5 3.2 16.8 4.5 9.6 11.7l-1.9.6.6-1.9ZM14 10.5v5H4.5V6h5',
  star: 'M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7Z',
  link: 'M8.6 11.4a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1M11.4 8.6a3 3 0 0 0-4.2 0L4.6 11.2a3 3 0 0 0 4.2 4.2l1-1',
  more: 'M4.5 10h.01M10 10h.01M15.5 10h.01',
  left: 'M12.5 4 6.5 10l6 6',
  right: 'M7.5 4l6 6-6 6',
  down: 'M5.5 8l4.5 4.5L14.5 8',
  close: 'M5 5l10 10M15 5 5 15',
  sliders: 'M3.5 6h8M14.5 6h2M3.5 14h2M8.5 14h8M13 4.3v3.4M7 12.3v3.4',
  user: 'M10 3.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4ZM3.8 16.5c.8-3 3.3-4.6 6.2-4.6s5.4 1.6 6.2 4.6',
  keyboard: 'M2.8 5.5h14.4v9H2.8ZM5.5 8.2h.01M8.2 8.2h.01M11 8.2h.01M13.8 8.2h.01M6.5 11.6h7',
  page: 'M5 2.8h6.5L15 6.3v10.9H5ZM11.3 2.8v3.7H15',
  arrowUp: 'M10 15.5v-11M5.5 9 10 4.5 14.5 9',
  collapse: 'M9.5 5 4.5 10l5 5M15.5 5l-5 5 5 5',
  expand: 'M10.5 5l5 5-5 5M4.5 5l5 5-5 5',
  history: 'M3.5 10a6.5 6.5 0 1 0 1.9-4.6M3.5 3.5v3h3M10 6.5V10l2.5 2',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  globe: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM3 10h14M10 3c2 2 2.8 4.4 2.8 7S12 15 10 17c-2-2-2.8-4.4-2.8-7S8 5 10 3Z',
  lock: 'M5.5 9h9v7.5h-9ZM7.3 9V6.8a2.7 2.7 0 0 1 5.4 0V9',
  translate: 'M3 5h8M7 3v2M9.5 5c-.7 3-2.6 5.3-5.5 6.5M5.5 7.5c.8 1.7 2.1 3 3.8 3.8M10.5 16.5l3-7.5 3 7.5M11.5 14.3h4',
  list: 'M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.8 5.5h.01M3.8 10h.01M3.8 14.5h.01',
  checkCircle: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM6.8 10.2l2.2 2.2 4.2-4.6',
  bell: 'M5.5 13.5V9a4.5 4.5 0 0 1 9 0v4.5l1.3 1.5H4.2ZM8.3 15.8a1.8 1.8 0 0 0 3.4 0',
  inbox: 'M3.5 11.5 5.3 4.5h9.4l1.8 7v4h-13ZM3.5 11.5h4l.8 1.8h3.4l.8-1.8h4',
  calendar: 'M4 5.5h12v10.5H4ZM4 8.5h12M7 3.5v3M13 3.5v3',
  clock: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM10 6.2V10l2.6 1.6',
  template: 'M4 4h12v12H4ZM4 8h12M8.5 8v8',
  timeline: 'M3.5 5.5h7M6.5 10h9M4.5 14.5h6',
  peek: 'M3.5 4.5h13v11h-13ZM11.5 4.5v11',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, className }: P & { name: IconName }) {
  const dots = name === 'more'
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={dots ? 2.4 : 1.35} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}
