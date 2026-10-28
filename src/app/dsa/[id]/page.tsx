import Link from 'next/link';
import { confidenceWord } from '@/features/dsa/words';
import { ConfirmDelete } from '@/components/confirm-delete';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  removeProblemAction,
  unhideProblemAction,
} from '@/features/deletes/actions';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { formatInTimeZone } from 'date-fns-tz';
import { ExternalLink, ArrowLeft } from 'lucide-react';
import { db, owner } from '@/server/db';
import { Disclosure } from '@/components/disclosure';
import { InterviewMentions } from '@/features/jobs/summary';
import { ProblemForm, RevisionForm } from '@/features/dsa/forms';
import { AttemptForm } from '@/features/dsa/attempt-form';
import { isDsa, revisionDay, solvedText } from '@/features/dsa/domain';
import { resourceUrl } from '@/lib/validation';
import { shortDate } from '@/lib/time';
import { traceForTopic } from '@/features/drills/trace';
import { WatchItRun } from '@/features/drills/watch-it-run';
import { StudyPrompt } from '@/features/roadmap/study-prompt';
import {
  DEFAULT_SCENARIOS,
  type Reference,
  type Scenario,
} from '@/features/roadmap/domain';
export const metadata = { title: 'Practice' };

const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;

export default async function Problem({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await owner(),
    { id } = await params,
    { from } = await searchParams,
    now = new Date();
  const p = await db().dsaProblem.findFirst({
    where: { id, userId: user.id },
    include: {
      topic: true,
      resources: true,
      attempts: { orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }] },
    },
  });
  if (!p) notFound();
  const [topics, origin, running, imported] = await Promise.all([
    db().dsaTopic.findMany({ orderBy: [{ ordering: 'asc' }, { name: 'asc' }] }),
    // The roadmap item this problem stands for: the one the owner came from, else the first.
    db().roadmapItem.findFirst({
      where: {
        userId: user.id,
        dsaProblemId: p.id,
        ...(from ? { id: from } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        section: true,
        roadmapId: true,
        scope: true,
        checkpoint: true,
        priority: true,
        estimateMinutes: true,
        references: true,
        notes: true,
        url: true,
        roadmap: {
          select: { title: true, promptTemplate: true, scenarios: true },
        },
      },
    }),
    db().actualSession.findFirst({
      where: { userId: user.id, endedAt: null },
      select: { startedAt: true, category: true },
    }),
    // From the imported curriculum: Hide, not Delete, since an import brings it back (WI-060).
    db().roadmapItem.count({
      where: { userId: user.id, dsaProblemId: p.id, slug: { not: null } },
    }),
  ]);
  const date = (d: Date | null) =>
    d ? formatInTimeZone(d, user.timezone, 'MMM d, yyyy · HH:mm') : 'Not yet';
  const legacy = p.attemptsCount - p.attempts.length;
  const defaultMinutes =
    running && isDsa(running.category)
      ? Math.max(1, Math.round((+now - +running.startedAt) / 60000))
      : null;
  const validUrl = resourceUrl.safeParse(p.problemUrl).success;
  const back = origin
    ? `/roadmap/${origin.roadmapId}?section=${encodeURIComponent(origin.section)}&show=all#item-${origin.id}`
    : null;
  return (
    <>
      {origin && from ? (
        <Link prefetch={false} className="link" href={back!}>
          <ArrowLeft size={14} aria-hidden="true" /> Back to {origin.title} on
          the roadmap
        </Link>
      ) : (
        <Link prefetch={false} className="link" href="/dsa">
          <ArrowLeft size={14} aria-hidden="true" /> Practice
        </Link>
      )}
      {p.hiddenAt && (
        <div className="status-line mt-4" role="status">
          <span>Hidden from Practice, For today and revisions.</span>
          <ActionForm
            action={unhideProblemAction}
            label="Show this problem again"
          >
            <input type="hidden" name="id" value={p.id} />
            <Button variant="secondary" className="small">
              Show again
            </Button>
          </ActionForm>
        </div>
      )}
      <p className="eyebrow mt-4">
        {p.topic.name} · {p.platform} · {p.difficulty.toLowerCase()}
      </p>
      <div className="page-head">
        <h1>{p.title}</h1>
        {validUrl && (
          <a
            className="button secondary"
            href={p.problemUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} aria-hidden="true" /> Open on {p.platform}
          </a>
        )}
      </div>
      <dl className="job-facts facts-strip">
        <div>
          <dt className="muted">Confidence</dt>
          <dd>
            <span
              className={`pill ${p.attemptsCount ? tone[p.confidence] : ''}`}
            >
              {p.attemptsCount ? confidenceWord(p.confidence) : 'Unattempted'}
            </span>
          </dd>
        </div>
        <div>
          <dt className="muted">Next revision</dt>
          <dd>
            {p.nextRevisionAt
              ? shortDate(revisionDay(p.nextRevisionAt))
              : 'Not scheduled'}
            {p.revisionManual ? ' (set by hand)' : ''}
          </dd>
        </div>
        <div>
          <dt className="muted">Attempts</dt>
          <dd>
            {p.attemptsCount}
            {p.revisionStage ? ` · revision stage ${p.revisionStage}` : ''}
          </dd>
        </div>
        <div>
          <dt className="muted">Last attempt</dt>
          <dd>{date(p.lastAttemptedAt)}</dd>
        </div>
      </dl>
      {p.notes && <p className="muted mb-5">{p.notes}</p>}
      {p.resources.length > 0 && (
        <p className="item-links mb-5">
          {p.resources.map((r) => (
            <a
              key={r.id}
              className="link"
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {r.title}
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          ))}
        </p>
      )}
      <section className="card" aria-labelledby="attempt-heading">
        <h2 id="attempt-heading">Record an attempt</h2>
        <AttemptForm
          problemId={p.id}
          requestId={randomUUID()}
          defaultMinutes={defaultMinutes}
        />
        {origin && from && (
          <p className="status-line mt-4">
            <Link prefetch={false} className="link" href={back!}>
              <ArrowLeft size={14} aria-hidden="true" /> Back to {origin.title}
            </Link>
          </p>
        )}
      </section>
      {origin && (
        <section className="card flat" aria-labelledby="study-heading">
          <div className="section-head">
            <h2 id="study-heading">Study</h2>
            <Link prefetch={false} className="link" href={back!}>
              {origin.roadmap.title} · {origin.section}
            </Link>
          </div>
          <StudyPrompt
            roadmap={{ title: origin.roadmap.title }}
            template={origin.roadmap.promptTemplate}
            scenarios={
              (origin.roadmap.scenarios as Scenario[] | null)?.length
                ? (origin.roadmap.scenarios as Scenario[])
                : DEFAULT_SCENARIOS
            }
            storageKey={`silsila-scenario:${origin.roadmapId}`}
            item={{
              title: origin.title,
              section: origin.section,
              scope: origin.scope,
              checkpoint: origin.checkpoint,
              priority: origin.priority,
              estimateMinutes: origin.estimateMinutes,
              references: origin.references as Reference[] | null,
              notes: origin.notes,
              url: origin.url,
            }}
          />
        </section>
      )}
      {traceForTopic(p.topic.name) && (
        <WatchItRun kind={traceForTopic(p.topic.name)!} />
      )}
      <section className="card flat" aria-labelledby="history-heading">
        <div className="section-head">
          <h2 id="history-heading">
            Attempts <span className="muted">· {p.attemptsCount}</span>
          </h2>
        </div>
        {legacy > 0 && (
          <p className="muted">
            {legacy} earlier attempt{legacy === 1 ? '' : 's'} without details.
          </p>
        )}
        {!p.attempts.length && <p className="muted">No attempts yet.</p>}
        <ol className="plain-list">
          {p.attempts.map((a) => (
            <li className="attempt-row" key={a.id}>
              <span className="attempt-when">{date(a.attemptedAt)}</span>
              <span>
                <span className={`pill ${tone[a.confidenceAfter]}`}>
                  {confidenceWord(a.confidenceAfter)}
                </span>{' '}
                {solvedText[a.solvedIndependently]}
                {a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}
                {a.actualSessionId ? ' · during a recorded session' : ''}
                {a.mistake && (
                  <span className="muted attempt-note">
                    Missed: {a.mistake}
                  </span>
                )}
                {a.notes && (
                  <span className="muted attempt-note">{a.notes}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
        <div className="roadmap-toggles mt-4">
          <Disclosure variant="link" label="Edit problem">
            <ProblemForm problem={p} topics={topics} />
          </Disclosure>
          {p.attemptsCount > 0 && (
            <Disclosure variant="link" label="Change revision date">
              <RevisionForm problem={p} />
            </Disclosure>
          )}
        </div>
      </section>
      <InterviewMentions userId={user.id} dsaProblemId={p.id} />
      {!p.hiddenAt && (
        <div className="panel-danger">
          <ConfirmDelete
            action={removeProblemAction}
            id={p.id}
            label={imported ? 'Hide problem' : 'Delete problem'}
            question={
              imported
                ? `Hide ${p.title} from Practice, For today and revisions? Its attempts stay, and Show again brings it back.`
                : `Delete ${p.title} and its ${p.attemptsCount} attempt${p.attemptsCount === 1 ? '' : 's'}? This cannot be undone.`
            }
          />
        </div>
      )}
    </>
  );
}
