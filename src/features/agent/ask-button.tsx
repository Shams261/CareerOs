'use client';
import { useRouter } from 'next/navigation';
import { askRumi } from './events';

/** Opens Ask Rumi with a question already asked (WI-042), handed over in this tab's storage. */
export function AskRumiButton({
  text,
  children,
  className = 'button secondary',
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => askRumi(text, (href) => router.push(href))}
    >
      {children}
    </button>
  );
}
