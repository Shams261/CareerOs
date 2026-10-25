import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { dsaSnapshot } from '@/features/dsa/service';
import { drillDeck } from '@/features/drills/deck';
import { WhichPattern } from '@/features/drills/which-pattern';

export const metadata = { title: 'Which pattern?' };

/**
 * Which Pattern? (WI-030): ten of the owner's own problems, chosen by code (Red and Yellow
 * first, then unattempted, then the oldest seen). No AI, and nothing is recorded.
 */
export default async function Drill() {
  const user = await owner();
  const { problems, topics } = await dsaSnapshot(user);
  const deck = drillDeck(problems, topics, dayKey(new Date(), user.timezone));
  return (
    <>
      <Link className="link" href="/dsa" prefetch={false}>
        <ArrowLeft size={14} aria-hidden="true" /> Practice
      </Link>
      <p className="eyebrow mt-4">Practice</p>
      <div className="page-head">
        <h1>Which pattern?</h1>
      </div>
      {deck ? (
        <WhichPattern deck={deck} />
      ) : (
        <section className="card" aria-labelledby="drill-empty">
          <h2 id="drill-empty">
            Add a few problems to Practice to drill patterns
          </h2>
          <p>The drill needs at least four problems and four topics.</p>
          <Link className="button" href="/dsa" prefetch={false}>
            Open Practice
          </Link>
        </section>
      )}
    </>
  );
}
