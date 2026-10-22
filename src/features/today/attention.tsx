import { ArrowRight } from 'lucide-react';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { dsaSnapshot } from '@/features/dsa/service';
import { revisionQueue } from '@/features/dsa/domain';
import { jobTodaySummary } from '@/features/jobs/service';
import { revisionDue } from '@/features/roadmap/service';
import { weeklyReviewOpen } from '@/features/review/service';
import type { ScheduleUser } from '@/features/schedule/service';
import { dayKey } from '@/lib/time';
import { attentionItems, type RoundLike } from './domain';
import { AttentionPages, AttentionRow } from './attention-rows';
import { PanelButton, SidePanel } from './panels';

const PREVIEW = 5;

/**
 * "Needs attention": one flat, bounded list from the memoized snapshots. Each source loads
 * independently; a failed source is named while the others still show. Rendered behind its
 * own Suspense and error boundary so the agenda never waits for it.
 */
export async function Attention({
  user,
  now,
  interviews,
  notifications,
}: {
  user: ScheduleUser;
  now: Date;
  interviews: RoundLike[];
  notifications: {
    id: string;
    type: string;
    title: string;
    scheduledFor: Date;
    dedupeKey: string;
  }[];
}) {
  const [jobs, roadmap, practice, weekly] = await Promise.allSettled([
    jobTodaySummary(user, now),
    revisionDue(user, now),
    dsaSnapshot(user),
    weeklyReviewOpen(user, now),
  ]);
  const failed = [
    jobs.status === 'rejected' ? 'Jobs' : null,
    roadmap.status === 'rejected' ? 'Roadmap' : null,
    practice.status === 'rejected' ? 'Practice' : null,
    weekly.status === 'rejected' ? 'Weekly review' : null,
  ].filter((x): x is string => !!x);
  const items = attentionItems({
    now,
    zone: user.timezone,
    interviews,
    jobs:
      jobs.status === 'fulfilled' && jobs.value
        ? jobs.value.attention.map(({ app, reasons }) => ({
            app: {
              id: app.id,
              company: app.company,
              nextAction: app.nextAction,
              nextActionDate: app.nextActionDate,
            },
            reasons,
          }))
        : [],
    roadmap: roadmap.status === 'fulfilled' ? roadmap.value : [],
    practice:
      practice.status === 'fulfilled'
        ? revisionQueue(
            practice.value.problems,
            dayKey(now, user.timezone),
          ).map((p) => ({
            id: p.id,
            title: p.title,
            confidence: p.confidence,
            nextRevisionAt: p.nextRevisionAt,
          }))
        : [],
    notifications,
    weeklyDue: weekly.status === 'fulfilled' && weekly.value,
  });
  const preview = items.slice(0, PREVIEW);
  return (
    <>
      <div className="attention-head">
        <h2 id="attention-heading">Needs attention</h2>
        {items.length > PREVIEW && (
          <span className="muted">
            Showing {PREVIEW} of {items.length}
          </span>
        )}
      </div>
      <FeedbackOutlet channel="attention" className="mb-2" />
      {failed.map((name) => (
        <p className="form-message" role="status" key={name}>
          {name} couldn’t load. Retry by reloading.
        </p>
      ))}
      {!items.length && !failed.length && (
        <p className="attention-empty">Nothing needs your attention.</p>
      )}
      {preview.length > 0 && (
        <ul className="plain-list attention-list attention-preview">
          {preview.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <p className="attention-more">
          <PanelButton panel="attention" className="link-button">
            View all {items.length} <ArrowRight size={14} aria-hidden="true" />
          </PanelButton>
        </p>
      )}
      <SidePanel id="attention" title={`Needs attention · ${items.length}`}>
        <FeedbackOutlet channel="attention" className="mb-2" />
        <AttentionPages items={items} />
      </SidePanel>
    </>
  );
}
export function AttentionSkeleton() {
  return (
    <div className="attention-head" aria-hidden="true">
      <h2>Needs attention</h2>
      <span className="skeleton-line w-40" />
    </div>
  );
}
