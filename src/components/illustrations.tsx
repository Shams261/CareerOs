/**
 * Three small line illustrations (one colour, 96 px) for the empty states that greet a
 * first visit: the first routine on Today, the first application on Jobs and the first
 * roadmap. Drawn in the accent colour with the stroke weight of the lucide icons; they
 * are decorative and hidden from assistive technology.
 */
const common = {
  width: 96,
  height: 96,
  viewBox: '0 0 96 96',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

/** A week of days with one block drawn in: the first routine. */
export function RoutineIllustration({
  className = '',
}: {
  className?: string;
}) {
  return (
    <svg {...common} className={`illustration ${className}`}>
      <rect x="14" y="20" width="68" height="60" rx="8" />
      <path d="M14 36h68M30 14v10M66 14v10" />
      <path d="M26 48h8M38 48h8M50 48h8M62 48h8M26 60h8M50 60h8M62 60h8M26 72h8M38 72h8" />
      <rect
        x="37"
        y="56"
        width="10"
        height="8"
        rx="2"
        fill="currentColor"
        stroke="none"
      />
      <circle cx="74" cy="22" r="7" />
      <path d="M74 18v4l3 2" />
    </svg>
  );
}

/** A briefcase with a path of three steps beside it: the first application. */
export function ApplicationIllustration({
  className = '',
}: {
  className?: string;
}) {
  return (
    <svg {...common} className={`illustration ${className}`}>
      <rect x="12" y="34" width="52" height="40" rx="8" />
      <path d="M26 34v-6a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v6M12 50h52" />
      <path d="M72 70c8 0 8-14 0-14s8-14 0-14" />
      <circle cx="80" cy="42" r="3" fill="currentColor" stroke="none" />
      <circle cx="80" cy="56" r="3" />
      <circle cx="80" cy="70" r="3" />
    </svg>
  );
}

/** A winding path with milestones, the first one filled: the first roadmap. */
export function RoadmapIllustration({
  className = '',
}: {
  className?: string;
}) {
  return (
    <svg {...common} className={`illustration ${className}`}>
      <path d="M16 76c8-18 20-18 28-6s20 12 28-6c3-7 6-12 10-14" />
      <circle cx="16" cy="76" r="5" fill="currentColor" stroke="none" />
      <circle cx="44" cy="64" r="5" />
      <circle cx="72" cy="64" r="5" />
      <path d="M82 50v-8" />
      <path d="M82 42h8l-3-4 3-4h-8z" />
    </svg>
  );
}
