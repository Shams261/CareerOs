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
import { WeekItems, type Row } from '@/features/roadmap/week-items';
import {
  neighbourSections,
  nextSectionWithMatch,
  weekSection,
} from '@/features/roadmap/week-items-domain';
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
import { dayKey, shortDate } from '@/lib/time';
import { sourcePlan } from '@/features/listen/domain';
import { isTestNamed } from '@/lib/test-data';
import { aiState } from '@/features/ai/service';
import { budgetLine } from '@/features/ai/domain';
import { formatInTimeZone } from 'date-fns-tz';
import { ArrowLeft, ArrowRight } from 'lucide-react';
/** The tab names the week and the roadmap (WI-089), so open weeks can be told apart. */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const [user, { id }, query] = await Promise.all([
    owner(),
    params,
    searchParams,
  ]);
  const roadmap = await roadmapDetail(user, id);
  if (!roadmap) return { title: 'Roadmap' };
  const section =
    query.section && roadmap.sections.has(query.section) ? query.section : null;
  return { title: section ? `${section} · ${roadmap.title}` : roadmap.title };
}

const dateLabel = (d: Date) =>
  formatInTimeZone(new Date(`${revisionDay(d)}T12:00:00Z`), 'UTC', 'MMM d');
const shows = ['all', 'open', 'p0', 'revision', 'asked'] as const;
type Show = (typeof shows)[number];

/**
 * One week of a roadmap as its own page (WI-088): ← the roadmap, the week's name as the title,
 * its counts and next item, and its items as rows that open in place. `?section=` names the
 * week (the current one when absent), `#item-` the open item; Search and Show narrow this
 * week's rows, and a Show view without a section opens the first week that has a match.
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
  const due = revisionQueue(roadmap.items, today).length;
  const scenarios = (roadmap.scenarios as Scenario[] | null)?.length
    ? (roadmap.scenarios as Scenario[])
    : DEFAULT_SCENARIOS;
  const show: Show = shows.includes(query.show as Show)
    ? (query.show as Show)
    : 'all';
  const q = (query.q ?? '').trim().toLowerCase();
  const doneToday = (item: { completedAt: Date | null }) =>
    !!item.completedAt && dayKey(item.completedAt, user.timezone) === today;
  const shown = (item: (typeof roadmap.items)[number]) =>
    // An item done today stays in the "not done" views until tomorrow (WI-048).
    (show === 'all' ||
      (show === 'open' && (item.status !== 'DONE' || doneToday(item))) ||
      (show === 'revision' &&
        ['due', 'overdue'].includes(revisionState(item, today))) ||
      (show === 'asked' && item.askedInInterview) ||
      (show === 'p0' &&
        item.priority === 1 &&
        (item.status !== 'DONE' || doneToday(item)))) &&
    (!q || item.title.toLowerCase().includes(q));
  const allRows = sectionNames
    .flatMap((name) => roadmap.sections.get(name)!)
    .map((item) => ({
      id: item.id,
      section: item.section,
      status: item.status,
      shown: shown(item),
    }));
  const section = weekSection(sectionNames, {
    asked: query.section ?? null,
    filtered: show !== 'all' || !!q,
    rows: allRows,
    current: roadmap.next?.section ?? null,
  });
  const items = section ? (roadmap.sections.get(section) ?? []) : [];
  const { prev, next } = neighbourSections(sectionNames, section);
  const sectionDone = items.filter((i) => i.status === 'DONE').length;
  const sectionNext =
    roadmap.next?.section === section
      ? roadmap.next
      : (items.find((i) => i.status === 'IN_PROGRESS') ??
        items.find((i) => i.status === 'NOT_STARTED') ??
        null);
  const matchesElsewhere = allRows.filter(
    (r) => r.shown && r.section !== section,
  ).length;
  const filterQuery = `${show !== 'all' ? `&show=${show}` : ''}${q ? `&q=${encodeURIComponent(query.q ?? '')}` : ''}`;
  const weekHref = (name: string) =>
    `/roadmap/${roadmap.id}?section=${encodeURIComponent(name)}`;
  // "N more in other weeks" takes the owner to the next week with a match (WI-089).
  const nextMatch = nextSectionWithMatch(sectionNames, allRows, section);
  const rows: Row[] = items.map((item) => ({
    item,
    revision: revisionState(item, today),
    revisionLabel: item.nextRevisionAt ? dateLabel(item.nextRevisionAt) : null,
    doneLabel: item.completedAt
      ? shortDate(dayKey(item.completedAt, user.timezone))
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
    shown: shown(item),
  }));
  return (
    <>
      <PageShortcuts
        prev={prev ? weekHref(prev) : undefined}
        next={next ? weekHref(next) : undefined}
        shortcuts={[
          { key: 'n', label: 'Add items', press: 'add-items' },
          { key: 'j', label: 'Next item', press: 'row-next' },
          { key: 'k', label: 'Previous item', press: 'row-prev' },
          {
            key: 'd',
            label: 'Mark the open item done (or revised)',
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
          { key: 'Escape', label: 'Close the open item', press: 'row-close' },
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
              <ArrowLeft size={14} aria-hidden="true" /> {roadmap.title}
              {roadmap.archivedAt ? ' · Archived' : ''}
            </Link>
          </div>
          <div className="today-head-actions">
            {items.length > 8 && <ItemFilters q={query.q ?? ''} show={show} />}
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
        {section && (
          <div className="week-head">
            <h1>{section}</h1>
            <p className="week-head-facts">
              <b>
                {sectionDone} done · {items.length - sectionDone} left
              </b>
              {sectionNext && <span> · Next: {sectionNext.title}</span>}
              {(show !== 'all' || q) && (
                <span>
                  {' '}
                  · {rows.filter((r) => r.shown).length} shown
                  {matchesElsewhere > 0 && nextMatch && (
                    <>
                      {', '}
                      <Link
                        prefetch={false}
                        className="link"
                        href={`${weekHref(nextMatch)}${filterQuery}`}
                      >
                        {matchesElsewhere} more in other weeks{' '}
                        <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    </>
                  )}
                </span>
              )}
            </p>
          </div>
        )}
      </header>
      <SidePanel id="add-items" title="Add items">
        <BulkItemsForm
          roadmapId={roadmap.id}
          sections={sectionNames}
          section={section ?? undefined}
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
      {!roadmap.items.length || !section ? (
        <section className="card">
          <h1 className="week-empty-title">{roadmap.title}</h1>
          <p className="empty">
            Nothing here yet. Add items from More: paste an outline, one line
            per item, and start a line with ? for a question.
          </p>
        </section>
      ) : (
        <PendingRegion className="week-region">
          <LinkOptionsProvider links={links}>
            <WeekItems
              key={`${section}:${q}:${show}`}
              roadmap={{
                id: roadmap.id,
                title: roadmap.title,
                promptTemplate: roadmap.promptTemplate,
              }}
              scenarios={scenarios}
              sections={sectionNames}
              rows={rows}
              next={roadmap.next?.id ?? null}
              section={section}
              q={q}
              grill={grill}
            />
          </LinkOptionsProvider>
          <nav className="week-nav" aria-label="Weeks">
            {prev ? (
              <Link prefetch={false} className="link" href={weekHref(prev)}>
                <ArrowLeft size={14} aria-hidden="true" /> {prev}
              </Link>
            ) : (
              <Link prefetch={false} className="link" href="/roadmap">
                <ArrowLeft size={14} aria-hidden="true" /> {roadmap.title}
              </Link>
            )}
            {next && (
              <Link
                prefetch={false}
                className="link week-nav-next"
                href={weekHref(next)}
              >
                {next} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </nav>
        </PendingRegion>
      )}
    </>
  );
}
