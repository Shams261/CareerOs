import { ConfirmDelete } from '@/components/confirm-delete';
import { deleteRoadmapAction } from '@/features/deletes/actions';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { owner, db } from '@/server/db';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { revisionContext } from '@/features/attention/domain';
import { PageShortcuts } from '@/components/shortcuts';
import { BulkItemsForm, RoadmapForm } from '@/features/roadmap/forms';
import { LinkOptionsProvider } from '@/features/roadmap/item-form';
import { RoadmapPane, type Row } from '@/features/roadmap/pane';
import { ItemFilters } from '@/features/roadmap/filters';
import { UtilityMenu } from '@/features/today/utility-menu';
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
import { sourcePlan } from '@/features/listen/domain';
import { isTestNamed } from '@/lib/test-data';
import { aiState } from '@/features/ai/service';
import { budgetLine } from '@/features/ai/domain';
import { formatInTimeZone } from 'date-fns-tz';
import { ArrowLeft } from 'lucide-react';
export const metadata = { title: 'Roadmap' };

const dateLabel = (d: Date) =>
  formatInTimeZone(new Date(`${revisionDay(d)}T12:00:00Z`), 'UTC', 'MMM d');
const shows = ['all', 'open', 'p0', 'revision', 'asked'] as const;
type Show = (typeof shows)[number];

/**
 * One roadmap as an outline and a reading pane (WI-084): one header line, the outline of every
 * section with its items on the left, the open item on the right. Search and Show narrow the
 * outline across the whole roadmap; `?section=` opens that section and `#item-` names the item.
 */
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
  const [links, goals, ai, cards] = await Promise.all([
    linkOptions(user.id),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
    roadmap.studyAi ? aiState(user) : null,
    db().revisionCard.findMany({
      where: { userId: user.id, roadmapItem: { roadmapId: roadmap.id } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        roadmapItemId: true,
        question: true,
        change: true,
        points: true,
      },
    }),
  ]);
  // Grill Me (WI-031): offered when the server has a key, the owner left it on, the provider
  // check holds, and this roadmap allows Study AI.
  const grill =
    ai && ai.configured && ai.enabled && !ai.blocked
      ? { budget: budgetLine(ai.spent) }
      : null;
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
  const left = roadmap.progress.total - roadmap.progress.done;
  const scenarios = (roadmap.scenarios as Scenario[] | null)?.length
    ? (roadmap.scenarios as Scenario[])
    : DEFAULT_SCENARIOS;
  const section =
    query.section && roadmap.sections.has(query.section) ? query.section : null;
  const show: Show = shows.includes(query.show as Show)
    ? (query.show as Show)
    : 'all';
  const q = (query.q ?? '').trim().toLowerCase();
  const doneToday = (item: { completedAt: Date | null }) =>
    !!item.completedAt && dayKey(item.completedAt, user.timezone) === today;
  const rows: Row[] = sectionNames
    .flatMap((name) => roadmap.sections.get(name)!)
    .map((item) => ({
      item,
      revision: revisionState(item, today),
      revisionLabel: item.nextRevisionAt
        ? dateLabel(item.nextRevisionAt)
        : null,
      revisionText:
        item.status === 'DONE' && item.nextRevisionAt
          ? revisionContext(revisionDay(item.nextRevisionAt), today)
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
      cards: cards.filter((c) => c.roadmapItemId === item.id),
      grillable: !!grill && !isTestNamed(item.title, roadmap.title),
      listenable:
        !!grill &&
        !isTestNamed(item.title, roadmap.title) &&
        sourcePlan(item.references).fetch.length > 0,
      // An item done today stays in the "not done" views until tomorrow (WI-048).
      shown:
        (show === 'all' ||
          (show === 'open' && (item.status !== 'DONE' || doneToday(item))) ||
          (show === 'revision' &&
            ['due', 'overdue'].includes(revisionState(item, today))) ||
          (show === 'asked' && item.askedInInterview) ||
          (show === 'p0' &&
            item.priority === 1 &&
            (item.status !== 'DONE' || doneToday(item)))) &&
        (!q || item.title.toLowerCase().includes(q)),
    }));
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
          ...(grill
            ? [
                {
                  key: 'g',
                  label: 'Grill me on the open item',
                  press: 'row-grill',
                },
              ]
            : []),
          { key: 'Escape', label: 'Back to the outline', press: 'row-close' },
        ]}
      />
      <header className="today-head roadmap-head">
        <div className="today-head-row">
          <div className="today-title">
            <Link
              prefetch={false}
              className="link roadmap-back"
              href="/roadmap"
            >
              <ArrowLeft size={14} aria-hidden="true" /> Roadmap
            </Link>
            <h1>{roadmap.title}</h1>
            <span className="today-date roadmap-count">
              {roadmap.progress.total
                ? `${roadmap.progress.done} done · ${left} left`
                : 'No items yet'}
              {roadmap.archivedAt ? ' · Archived' : ''}
            </span>
          </div>
          <div className="today-head-actions">
            {roadmap.progress.total > 5 && (
              <ItemFilters q={query.q ?? ''} show={show} />
            )}
            <UtilityMenu>
              <PanelButton
                panel="add-items"
                className="link-button today-util"
                data-shortcut="add-items"
              >
                Add items
              </PanelButton>
              <PanelButton
                panel="roadmap-edit"
                className="link-button today-util"
              >
                Edit roadmap
              </PanelButton>
              {due > 0 && show !== 'revision' && (
                <Link
                  prefetch={false}
                  className="link-button today-util"
                  href={`/roadmap/${roadmap.id}?show=revision`}
                >
                  {due} due for revision
                </Link>
              )}
              {roadmap.progress.asked > 0 && show !== 'asked' && (
                <Link
                  prefetch={false}
                  className="link-button today-util"
                  href={`/roadmap/${roadmap.id}?show=asked`}
                >
                  {roadmap.progress.asked} asked in interviews
                </Link>
              )}
            </UtilityMenu>
          </div>
        </div>
        {(roadmap.goal || roadmap.curriculum) && (
          <p className="today-summary">
            <span>
              {roadmap.curriculum
                ? 'Default roadmap'
                : `Toward ${roadmap.goal!.title}`}
            </span>
          </p>
        )}
      </header>
      <SidePanel id="add-items" title="Add items">
        <BulkItemsForm
          roadmapId={roadmap.id}
          sections={sectionNames}
          section={section ?? sectionNames[0]}
        />
      </SidePanel>
      <SidePanel id="roadmap-edit" title={`Edit ${roadmap.title}`}>
        <RoadmapForm roadmap={roadmap} goals={goals} />
        {/* The default curriculum is archived, never deleted (WI-064). */}
        {!roadmap.curriculum && (
          <div className="panel-danger">
            <ConfirmDelete
              action={deleteRoadmapAction}
              id={roadmap.id}
              label="Delete roadmap"
              question={`Delete ${roadmap.title} and its ${roadmap.progress.total} item${roadmap.progress.total === 1 ? '' : 's'}? Archive keeps them; this cannot be undone.`}
            />
          </div>
        )}
      </SidePanel>
      {!roadmap.items.length ? (
        <section className="card">
          <p className="empty">
            Nothing here yet. Add items from More: paste an outline, one line
            per item, and start a line with ? for a question.
          </p>
        </section>
      ) : (
        <PendingRegion className="roadmap-pane-region">
          <LinkOptionsProvider links={links}>
            <RoadmapPane
              key={`${q}:${show}`}
              roadmap={{
                id: roadmap.id,
                title: roadmap.title,
                promptTemplate: roadmap.promptTemplate,
              }}
              scenarios={scenarios}
              sections={sections}
              rows={rows}
              next={roadmap.next?.id ?? null}
              section={section}
              q={q}
              grill={grill}
            />
          </LinkOptionsProvider>
        </PendingRegion>
      )}
    </>
  );
}
