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
  arrowDown: 'M10 4.5v11M5.5 11 10 15.5 14.5 11',
  arrowLeft: 'M15.5 10h-11M9 5.5 4.5 10 9 14.5',
  arrowRight: 'M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5',
  wrap: 'M3.5 5.5h13M3.5 10h10.5a2.5 2.5 0 0 1 0 5H10M11.5 13l-2 2 2 2M3.5 14.5h3',
  hash: 'M8 3.5 6.5 16.5M13.5 3.5 12 16.5M4 7.5h12.5M3.5 12.5H16',
  refresh: 'M4 8a6 6 0 0 1 10.6-2.6M16 4v2.5h-2.5M16 12a6 6 0 0 1-10.6 2.6M4 16v-2.5h2.5',
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
  openFull: 'M11.5 3.5h5v5M16.5 3.5l-6 6M8.5 16.5h-5v-5M3.5 16.5l6-6',
  up: 'M5.5 12l4.5-4.5 4.5 4.5',
  chatPlus: 'M10 3.5a6.5 6.5 0 0 0-5.6 9.8l-.9 3.2 3.2-.9A6.5 6.5 0 1 0 10 3.5ZM10 7.5v5M7.5 10h5',
  modeSidebar: 'M3.5 4.5h13v11h-13ZM12 4.5v11',
  modeFloating: 'M3.5 4.5h13v11h-13ZM10.5 10h4v3.5h-4Z',
  modeFull: 'M3.5 4.5h13v11h-13ZM6 7h8v6H6Z',
  minus: 'M5.5 10h9',
  shield: 'M10 3 4.5 5v4.5c0 3.4 2.3 6.2 5.5 7.5 3.2-1.3 5.5-4.1 5.5-7.5V5ZM7.6 10l1.7 1.7 3.2-3.4',
  eye: 'M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5ZM10 7.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z',
  eyeOff: 'M3.5 3.5l13 13M8.3 5.2A7.8 7.8 0 0 1 10 5c4.7 0 7.5 5 7.5 5a12 12 0 0 1-2.2 2.8M12.7 14.6A7 7 0 0 1 10 15c-4.7 0-7.5-5-7.5-5a12.5 12.5 0 0 1 3.1-3.6M8.4 8.4a2.2 2.2 0 0 0 3.2 3.2',
  group: 'M3.5 4.5h13M3.5 8.5h13M3.5 12.5h6M3.5 16.5h6M12.5 12.5h4v4h-4Z',
  back: 'M15.5 10h-11M9 5.5 4.5 10 9 14.5',
  library: 'M4 4v12M7.5 4v12M11 4.5l3.5 11.3M3 16.5h14',
  peek: 'M3.5 4.5h13v11h-13ZM11.5 4.5v11',
  attach: 'M14.2 9.3 9.4 14.1a3.1 3.1 0 0 1-4.4-4.4l5.6-5.6a2.1 2.1 0 0 1 3 3l-5.5 5.5a1 1 0 0 1-1.5-1.5l5-5',
  pencil: 'M13.3 3.7l3 3-9 9-3.6.6.6-3.6ZM11.6 5.4l3 3',
  chat: 'M4 4.5h12v8.5H9l-3.5 3v-3H4Z',
  copy: 'M7 7h9v9.5H7ZM13 7V3.5H4V13h3',
  duplicate: 'M6.5 6.5h10v10h-10ZM13.5 6.5v-3h-10v10h3M11.5 9.5v4M9.5 11.5h4',
  moveTo: 'M3.5 15.5v-3a4 4 0 0 1 4-4h9M12.5 4.5l4 4-4 4',
  text: 'M3 15.5 6.5 5h1L11 15.5M4.3 12h5.4M12.5 10.5c.5-.8 1.3-1.2 2.3-1.2 1.4 0 2.2.8 2.2 2.2v4M17 12.8c-.6-.3-1.3-.4-2-.4-1.4 0-2.4.6-2.4 1.6 0 .9.7 1.5 1.8 1.5 1.2 0 2.1-.7 2.6-1.6',
  turnInto: 'M4 8a6 6 0 0 1 10.6-2.6M16 4v2.5h-2.5M16 12a6 6 0 0 1-10.6 2.6M4 16v-2.5h2.5',
  palette: 'M10 3a7 7 0 1 0 0 14c1 0 1.5-.6 1.5-1.4 0-1.1-.9-1.4-.9-2.4 0-.8.6-1.4 1.6-1.4H14c1.7 0 3-1.3 3-3C17 5.7 13.9 3 10 3ZM6.5 9.5h.01M8.5 6.3h.01M12 6h.01M14.3 8.5h.01',
  export: 'M10 12.5V3M6 7l4-4 4 4M3.5 13.5v3h13v-3',
  fullWidth: 'M2.5 10h15M5.5 7l-3 3 3 3M14.5 7l3 3-3 3',
  smallText: 'M3 14.5 6.5 5h1l3.5 9.5M4.3 11h5.4M15 6v8.5M13 12.5l2 2 2-2',
  unlock: 'M5.5 9h9v7.5h-9ZM7.3 9V6.8a2.7 2.7 0 0 1 5.3-.8',
  filter: 'M3.5 6h13M6 10h8M8.5 14h3',
  sort: 'M6.5 4v12M3.5 7l3-3 3 3M13.5 16V4M10.5 13l3 3 3-3',
  tableView: 'M3.5 4.5h13v11h-13ZM3.5 8.5h13M3.5 12h13M8 8.5v7',
  board: 'M3.5 4.5h3.5v9H3.5ZM8.3 4.5h3.5v6H8.3ZM13 4.5h3.5v11H13Z',
  gallery: 'M3.5 4.5h5.5v5H3.5ZM11 4.5h5.5v5H11ZM3.5 11.5h5.5v4H3.5ZM11 11.5h5.5v4H11Z',
  question: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM7.8 8a2.3 2.3 0 0 1 4.4.8c0 1.6-2.2 1.8-2.2 3.3M10 14.3h.01',
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
