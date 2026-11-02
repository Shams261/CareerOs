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
