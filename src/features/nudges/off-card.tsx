import Link from 'next/link';
import { cookies } from 'next/headers';
import { BellOff } from 'lucide-react';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/features/schedule/service';
import { NUDGES_CARD_COOKIE } from './domain';
import { DismissNudgesCard } from './off-card-dismiss';

/**
 * One card on Today while every study nudge is off (WI-060): the morning plan, the block-start
 * nudge and the evening check-in are what make Silsila remind you to study. Turning them on is
 * the owner's choice in Settings; the app never does it for them. Dismiss hides it for 30 days.
 */
export async function NudgesOffCard({ user }: { user: ScheduleUser }) {
  if ((await cookies()).get(NUDGES_CARD_COOKIE)) return null;
  const s = await db().studyNudgeSetting.findUnique({
    where: { userId: user.id },
    select: {
      morningEnabled: true,
      eveningEnabled: true,
      blockStartEnabled: true,
    },
  });
  if (s && (s.morningEnabled || s.eveningEnabled || s.blockStartEnabled))
    return null;
  return (
    <section
      className="card flat nudges-off"
      aria-labelledby="nudges-off-heading"
    >
      <BellOff size={18} aria-hidden="true" className="nudges-off-icon" />
      <div>
        <h2 id="nudges-off-heading">Study nudges are off</h2>
        <p>No morning plan, block-start nudge or evening check-in is sent.</p>
        <div className="actions">
          <Link
            className="button secondary small"
            href="/settings#notifications-heading"
            prefetch={false}
          >
            Turn on in Settings
          </Link>
          <DismissNudgesCard />
        </div>
      </div>
    </section>
  );
}
