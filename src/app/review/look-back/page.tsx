import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { owner } from '@/server/db';
import { lookBack } from '@/features/look-back/service';
import { MomentCard, MonthCard, SeasonGrid } from '@/features/look-back/view';

export const metadata = { title: 'Look back' };

/**
 * Look Back (WI-034): the season so far from the owner's own records. Every square is a
 * small Day Print; moments are the real firsts; the month is facts. No score, no streak.
 */
export default async function LookBack() {
  const user = await owner();
  const data = await lookBack(user);
  return (
    <>
      <Link className="link" href="/review" prefetch={false}>
        <ArrowLeft size={14} aria-hidden="true" /> Weekly review
      </Link>
      <p className="eyebrow mt-4">Look back</p>
      <div className="page-head">
        <h1>Your season so far</h1>
        {data && (
          <span className="muted look-back-range">
            {data.grid.range} · every square is one day
          </span>
        )}
      </div>
      {!data ? (
        <section className="card" aria-labelledby="look-back-empty">
          <h2 id="look-back-empty">Nothing recorded yet</h2>
          <p>Your season starts with the first recorded session.</p>
          <Link className="button" href="/today" prefetch={false}>
            Open Today
          </Link>
        </section>
      ) : (
        <div className="look-back">
          <div className="look-back-grid">
            <SeasonGrid weeks={data.grid.weeks} />
            <p className="muted look-back-note">
              Open a square to see that day. A thin single ring is a rest day.
              {data.grid.clipped ? ' The last 26 weeks are shown.' : ''}
            </p>
          </div>
          <div className="look-back-side">
            <MomentCard moments={data.moments} />
            <MonthCard month={data.month} />
          </div>
        </div>
      )}
    </>
  );
}
