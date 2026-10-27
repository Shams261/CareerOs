'use client';
import { useRouter } from 'next/navigation';
import { ASK_KEY } from './events';

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
      onClick={() => {
        try {
          sessionStorage.setItem(ASK_KEY, text);
        } catch {
          return;
        }
        router.push('/rumi');
      }}
    >
      {children}
    </button>
  );
}
