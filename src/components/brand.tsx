/** Provisional mark: replace with supplied SVG artwork when available. */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`brand-mark ${className}`}
      viewBox="0 0 112 56"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="29" cy="28" r="22" stroke="currentColor" strokeWidth="6" />
      <circle
        cx="56"
        cy="28"
        r="22"
        stroke="var(--brand-accent)"
        strokeWidth="6"
      />
      <circle cx="83" cy="28" r="22" stroke="currentColor" strokeWidth="6" />
      <path
        d="M 46.9 15.2 A 22 22 0 0 1 46.9 40.8"
        stroke="currentColor"
        strokeWidth="6"
      />
    </svg>
  );
}
/** Neutral text fallback, not a recreation of the supplied wordmark. */
export function BrandLogo({ stacked = false }: { stacked?: boolean }) {
  return (
    <span
      className={`brand-logo${stacked ? ' brand-logo-stacked' : ''}`}
      aria-label="Silsila"
    >
      <BrandMark />
      <span className="brand-name-fallback" aria-hidden="true">
        Silsila
      </span>
    </span>
  );
}
