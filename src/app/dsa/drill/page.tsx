import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { dsaSnapshot } from '@/features/dsa/service';
import { drillDeck } from '@/features/drills/deck';
import { WhichPattern } from '@/features/drills/which-pattern';

export const metadata = { title: 'Pattern quiz' };

/**
 * Which Pattern? (WI-030): ten of the owner's own problems, chosen by code (Red and Yellow
 * first, then unattempted, then the oldest seen). No AI, and nothing is recorded.
 */
export default async function Drill({
  searchParams,
}: {
  searchParams: Promise<{ topics?: string }>;
}) {
  const user = await owner();
  const { problems, topics } = await dsaSnapshot(user);
  const day = dayKey(new Date(), user.timezone);
  // A mixed set from the pattern coach (WI-106): the owner's last topics only, when they hold
  // enough problems for a deck; otherwise the usual deck.
  const only = new Set(
    ((await searchParams).topics ?? '').split(',').filter(Boolean).slice(0, 6),
  );
  const mixed = only.size
    ? drillDeck(
        problems.filter((p) => only.has(p.topicId)),
        topics,
        day,
      )
    : null;
  const deck = mixed ?? drillDeck(problems, topics, day);
  return (
    <>
      <Link className="link" href="/dsa" prefetch={false}>
        <ArrowLeft size={14} aria-hidden="true" /> Practice
      </Link>
      <p className="eyebrow mt-4">Practice</p>
      <div className="page-head">
        <h1>Pattern quiz</h1>
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
