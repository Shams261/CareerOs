import Link from 'next/link';
import { notFound } from 'next/navigation';
import { owner, db } from '@/server/db';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import { BulkItemsForm, RoadmapForm } from '@/features/roadmap/forms';
import { LinkOptionsProvider } from '@/features/roadmap/item-form';
import { ItemList, type Row } from '@/features/roadmap/item-list';
import { ItemFilters, SectionNav } from '@/features/roadmap/section-nav';
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
      due: revisionQueue(items, today).length,
    };
  });
  const due = revisionQueue(roadmap.items, today).length;
  const scenarios = (roadmap.scenarios as Scenario[] | null)?.length
    ? (roadmap.scenarios as Scenario[])
    : DEFAULT_SCENARIOS;
  // The section shown: the one asked for, else the one holding Continue, else the first.
  const selected =
    query.section && roadmap.sections.has(query.section)
      ? query.section
      : (roadmap.next?.section ?? sectionNames[0] ?? '');
  const show: Show = shows.includes(query.show as Show)
    ? (query.show as Show)
    : 'all';
  const q = (query.q ?? '').trim().toLowerCase();
  const rows: Row[] = (roadmap.sections.get(selected) ?? [])
    .filter(
      (item) =>
        (show === 'all' ||
          (show === 'open' && item.status !== 'DONE') ||
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
        dsaProblem: item.dsaProblem,
        dsaTopic: item.dsaTopic,
      },
    }));
  const current = sections.find((s) => s.name === selected);
  const initialOpen =
    roadmap.next && roadmap.next.section === selected ? roadmap.next.id : null;
  return (
    <>
      <PageShortcuts
        shortcuts={[{ key: 'n', label: 'Add items', press: 'add-items' }]}
      />
      <Link className="link" href="/roadmap">
        ← Roadmap
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
        <div className="roadmap-layout">
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
              {(current?.total ?? 0) > 5 && (
                <ItemFilters q={query.q ?? ''} show={show} />
              )}
            </div>
            <LinkOptionsProvider links={links}>
              <ItemList
                key={`${selected}:${show}:${q}`}
                roadmap={{
                  id: roadmap.id,
                  title: roadmap.title,
                  promptTemplate: roadmap.promptTemplate,
                }}
                scenarios={scenarios}
                sections={sectionNames}
                rows={rows}
                initialOpen={initialOpen}
              />
            </LinkOptionsProvider>
          </section>
        </div>
      )}
    </>
  );
}
