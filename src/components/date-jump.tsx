'use client';
import { useRouter } from 'next/navigation';

/**
 * A bare date field that opens the chosen day or week once a full date is typed.
 * Mount it with `key={value}` so it follows the arrows and the shortcuts.
 */
export function DateJump({
  value,
  path,
  label,
}: {
  value: string;
  path: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <label className="date-jump">
      <span className="sr-only">{label}</span>
      <input
        type="date"
        aria-label={label}
        defaultValue={value}
        onChange={(event) => {
          // A year still being typed ("0002") must not open the year 2.
          const value = event.target.value;
          if (value && Number(value.slice(0, 4)) >= 2000)
            router.push(`${path}?date=${value}`);
        }}
      />
    </label>
  );
}
