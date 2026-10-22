import Link from 'next/link';
import { notFound } from 'next/navigation';
import { owner, db } from '@/server/db';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import { BulkItemsForm, RoadmapForm } from '@/features/roadmap/forms';
import { LinkOptionsProvider } from '@/features/roadmap/item-form';
import { ItemList, type Row } from '@/features/roadmap/item-list';
import { ItemFilters, SectionNav } from '@/features/roadmap/section-nav';
import { PendingRegion } from '@/components/pending-region';
import { linkOptions, roadmapDetail } from '@/features/roadmap/service';
import {
  DEFAULT_SCENARIOS,
  revisionDay,
  revisionQueue,
  revisionState,
  type Scenario,
} from '@/features/roadmap/domain';
import { dayKey } from '@/lib/time';
import { formatInTimeZone } from 'date-fns-tz';
import { ArrowLeft } from 'lucide-react';
export const metadata = { title: 'Roadmap' };

const dateLabel = (d: Date) =>
  formatInTimeZone(new Date(`${revisionDay(d)}T12:00:00Z`), 'UTC', 'MMM d');
const shows = ['all', 'open', 'revision', 'asked'] as const;
type Show = (typeof shows)[number];

export default async function RoadmapDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; q?: string; show?: string }>;
}) {
  const user = await owner(),
    { id } = await params,
    query = await searchParams,
    roadmap = await roadmapDetail(user, id);
  if (!roadmap) notFound();
  const today = dayKey(new Date(), user.timezone);
  const [links, goals] = await Promise.all([
    linkOptions(user.id),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
  ]);
  const sectionNames = [...roadmap.sections.keys()];
  const sections = sectionNames.map((name) => {
    const items = roadmap.sections.get(name)!;
    return {
      name,
      total: items.length,
      done: items.filter((i) => i.status === 'DONE').length,
      inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
      due: revisionQueue(items, today).length,
      isContinue: roadmap.next?.section === name,
    };
  });
  const due = revisionQueue(roadmap.items, today).length;
  // "about N weeks at your pace": the last four weeks of Done, no quota and no score.
  const fourWeeksAgo = new Date(+new Date() - 28 * 86400000);
  const recentDone = roadmap.items.filter(
    (i) =>
      i.status === 'DONE' && i.completedAt && i.completedAt >= fourWeeksAgo,
  ).length;
  const left = roadmap.progress.total - roadmap.progress.done;
  // Shown only once the pace means something: under a year at the recent rate.
  const pace =
    recentDone > 0 && left > 0 ? Math.ceil(left / (recentDone / 4)) : null;
  const weeksLeft = pace !== null && pace <= 52 ? pace : null;
  const scenarios = (roadmap.scenarios as Scenario[] | null)?.length
    ? (roadmap.scenarios as Scenario[])
    : DEFAULT_SCENARIOS;
  // The section shown: the one asked for, else the one holding Continue, else the first.
  const selected =
    query.section && roadmap.sections.has(query.section)
      ? query.section
      : (roadmap.next?.section ?? sectionNames[0] ?? '');
  const current = sections.find((s) => s.name === selected);
  // Long sections with progress open on what is left; the hint below says what is hidden.
  const defaultShow: Show =
    (current?.total ?? 0) > 15 && (current?.done ?? 0) > 0 ? 'open' : 'all';
  const show: Show = shows.includes(query.show as Show)
    ? (query.show as Show)
    : defaultShow;
  const q = (query.q ?? '').trim().toLowerCase();
  const rows: Row[] = (roadmap.sections.get(selected) ?? [])
    .filter(
      (item) =>
        (show === 'all' ||
          (show === 'open' &&
            (item.status !== 'DONE' ||
              (!!item.completedAt &&
                dayKey(item.completedAt, user.timezone) === today))) ||
          (show === 'revision' &&
            ['due', 'overdue'].includes(revisionState(item, today))) ||
          (show === 'asked' && item.askedInInterview)) &&
        (!q || item.title.toLowerCase().includes(q)),
    )
    .map((item) => ({
      item,
      revision: revisionState(item, today),
      revisionLabel: item.nextRevisionAt
        ? dateLabel(item.nextRevisionAt)
        : null,
      links: {
        learningTopic: item.learningTopic
          ? {
              id: item.learningTopic.id,
              title: item.learningTopic.title,
              subject: item.learningTopic.subject.name,
            }
          : null,
        dsaProblem: item.dsaProblem
          ? {
              id: item.dsaProblem.id,
              title: item.dsaProblem.title,
              confidence: item.dsaProblem.confidence,
              attemptsCount: item.dsaProblem.attemptsCount,
              nextRevision: item.dsaProblem.nextRevisionAt
                ? dateLabel(item.dsaProblem.nextRevisionAt)
                : null,
            }
          : null,
        dsaTopic: item.dsaTopic,
      },
    }));
  const initialOpen =
    roadmap.next && roadmap.next.section === selected ? roadmap.next.id : null;
  return (
    <>
      <PageShortcuts
        shortcuts={[
          { key: 'n', label: 'Add items', press: 'add-items' },
          { key: 'j', label: 'Next item', press: 'row-next' },
          { key: 'k', label: 'Previous item', press: 'row-prev' },
          {
            key: 'd',
            label: 'Mark the item done (or revised)',
            press: 'row-done',
          },
          { key: 'c', label: 'Copy the study prompt', press: 'row-copy' },
          { key: 'Escape', label: 'Close the open item', press: 'row-close' },
        ]}
      />
      <Link className="link" href="/roadmap">
        <ArrowLeft size={14} aria-hidden="true" /> Roadmap
      </Link>
      <p className="eyebrow mt-4">
        {roadmap.goal ? `Toward ${roadmap.goal.title}` : 'Roadmap'}
        {roadmap.archivedAt ? ' · Archived' : ''}
      </p>
      <div className="page-head">
        <h1>{roadmap.title}</h1>
        <Disclosure label="Add items" variant="primary" shortcut="add-items">
          <BulkItemsForm
            roadmapId={roadmap.id}
            sections={sectionNames}
            section={selected}
          />
        </Disclosure>
      </div>
      <div className="status-line mb-7">
        <span>
          {roadmap.progress.done} of {roadmap.progress.total} done
        </span>
        {weeksLeft !== null && (
          <span>
            about {weeksLeft} week{weeksLeft === 1 ? '' : 's'} at your pace
          </span>
        )}
        {roadmap.progress.asked > 0 && (
          <span>{roadmap.progress.asked} asked in interviews</span>
        )}
        {due > 0 && (
          <span>
            <Link
              className="link"
              href={`/roadmap/${roadmap.id}?section=${encodeURIComponent(
                sections.find((s) => s.due > 0)?.name ?? selected,
              )}&show=revision`}
            >
              {due} due for revision
            </Link>
          </span>
        )}
        {roadmap.next && (
          <span>
            Continue:{' '}
            <Link
              className="link"
              href={`/roadmap/${roadmap.id}?section=${encodeURIComponent(roadmap.next.section)}#item-${roadmap.next.id}`}
            >
              {roadmap.next.title}
            </Link>
          </span>
        )}
        <Disclosure variant="link" label="Edit roadmap">
          <RoadmapForm roadmap={roadmap} goals={goals} />
        </Disclosure>
      </div>
      {!roadmap.items.length ? (
        <section className="card">
          <p className="muted">
            Nothing here yet. Add items above: paste an outline, one line per
            item, and start a line with ? for a question.
          </p>
        </section>
      ) : (
        <PendingRegion className="roadmap-layout">
          <SectionNav
            roadmapId={roadmap.id}
            sections={sections}
            selected={selected}
          />
          <section
            className="roadmap-section"
            aria-labelledby="section-heading"
          >
            <div className="section-head">
              <h2 id="section-heading">
                {selected}{' '}
                <span className="muted">
                  · {current?.done ?? 0} of {current?.total ?? 0}
                </span>
              </h2>
              <span className="section-tools">
                {(current?.due ?? 0) > 0 && show !== 'revision' && (
                  <Link
                    className="pill warning pill-link"
                    href={`/roadmap/${roadmap.id}?section=${encodeURIComponent(selected)}&show=revision`}
                  >
                    Due · {current!.due}
                  </Link>
                )}
                {(current?.total ?? 0) > 5 && (
                  <ItemFilters q={query.q ?? ''} show={show} />
                )}
              </span>
            </div>
            {show === 'open' && !query.show && (current?.done ?? 0) > 0 && (
              <p className="muted mb-3">
                {current!.done} done hidden ·{' '}
                <Link
                  className="link"
                  href={`/roadmap/${roadmap.id}?section=${encodeURIComponent(selected)}&show=all`}
                >
                  Show everything
                </Link>
              </p>
            )}
            <LinkOptionsProvider links={links}>
              <ItemList
                key={`${selected}:${q}`}
                roadmap={{
                  id: roadmap.id,
                  title: roadmap.title,
                  promptTemplate: roadmap.promptTemplate,
                }}
                scenarios={scenarios}
                sections={sectionNames}
                rows={rows}
                initialOpen={initialOpen}
                show={show}
                nextDue={(() => {
                  const i = sections.findIndex((s) => s.name === selected);
                  const after = [
                    ...sections.slice(i + 1),
                    ...sections.slice(0, i),
                  ];
                  const n = after.find((s) => s.due > 0);
                  return n ? { name: n.name, due: n.due } : null;
                })()}
              />
            </LinkOptionsProvider>
          </section>
        </PendingRegion>
      )}
    </>
  );
}
