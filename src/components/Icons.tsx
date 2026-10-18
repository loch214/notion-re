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
