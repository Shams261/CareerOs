'use client';
import { useRouter } from 'next/navigation';

/** A bare date field that opens the chosen day or week as soon as it changes. */
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
          if (event.target.value)
            router.push(`${path}?date=${event.target.value}`);
        }}
      />
    </label>
  );
}
