import { setupLine } from '@/features/setup/domain';
import Link from 'next/link';
import { Check, Circle } from 'lucide-react';
import type { SettingsView } from '../page-data';

/** Make Silsila yours (WI-050), only while Today's card is hidden. */
export function SetupSteps({ v }: { v: SettingsView }) {
  const { steps } = v;
  return (
    <section className="card" aria-labelledby="start-heading">
      <h2 id="start-heading">Make Silsila yours</h2>
      <p className="muted">{setupLine(steps)}</p>
      <ol className="plain-list checklist">
        {steps.map((s) => (
          <li key={s.key}>
            {s.done ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Circle size={14} aria-hidden="true" />
            )}{' '}
            <span className="sr-only">{s.done ? 'Done:' : 'To do:'}</span>{' '}
            <Link
              prefetch={false}
              className="link"
              href={
                s.href.startsWith('/settings')
                  ? s.href.slice('/settings'.length)
                  : s.href
              }
            >
              {s.title}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
