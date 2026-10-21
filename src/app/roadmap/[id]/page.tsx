import Link from 'next/link';
import { notFound } from 'next/navigation';
import { owner, db } from '@/server/db';
import { ResourceLink } from '@/components/resource-link';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import {
  BulkItemsForm,
  ItemControls,
  ItemForm,
  RoadmapForm,
} from '@/features/roadmap/forms';
import { StudyPrompt } from '@/features/roadmap/study-prompt';
import { linkOptions, roadmapDetail } from '@/features/roadmap/service';
import {
  DEFAULT_SCENARIOS,
  revisionDay,
  revisionQueue,
  revisionState,
  type Reference,
  type Scenario,
} from '@/features/roadmap/domain';
import { dayKey } from '@/lib/time';
import { formatInTimeZone } from 'date-fns-tz';

const mark = { NOT_STARTED: '○', IN_PROGRESS: '◐', DONE: '✓' } as const;
const markText = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
} as const;
/** Filters appear once a roadmap is long enough to need them. */
const FILTER_THRESHOLD = 8;
const statusFilters = {
  all: 'Everything',
  open: 'Not done',
  in_progress: 'In progress',
  done: 'Done',
  revision: 'Due for revision',
  asked: 'Asked in interviews',
} as const;
const dateLabel = (d: Date) =>
  formatInTimeZone(new Date(`${revisionDay(d)}T12:00:00Z`), 'UTC', 'MMM d');
type StatusFilter = keyof typeof statusFilters;

export default async function RoadmapDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const user = await owner(),
    { id } = await params,
    query = await searchParams,
    roadmap = await roadmapDetail(user, id);
  if (!roadmap) notFound();
  const today = dayKey(new Date(), user.timezone);
  const due = revisionQueue(roadmap.items, today).length;
  const [links, goals] = await Promise.all([
    linkOptions(user.id),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
  ]);
  const sections = [...roadmap.sections.keys()];
  const scenarios = (roadmap.scenarios as Scenario[] | null)?.length
    ? (roadmap.scenarios as Scenario[])
    : DEFAULT_SCENARIOS;
  const filtering = roadmap.items.length > FILTER_THRESHOLD;
  const status: StatusFilter =
    filtering && query.status && query.status in statusFilters
      ? (query.status as StatusFilter)
      : 'all';
  const priority =
    filtering && ['1', '2', '3'].includes(query.priority ?? '')
      ? Number(query.priority)
      : 0;
  const keep = (item: (typeof roadmap.items)[number]) =>
    (status === 'all' ||
      (status === 'open' && item.status !== 'DONE') ||
      (status === 'in_progress' && item.status === 'IN_PROGRESS') ||
      (status === 'done' && item.status === 'DONE') ||
      (status === 'revision' &&
        ['due', 'overdue'].includes(revisionState(item, today))) ||
      (status === 'asked' && item.askedInInterview)) &&
    (!priority || item.priority === priority);
  const shown = roadmap.items.filter(keep).length;
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
          <BulkItemsForm roadmapId={roadmap.id} sections={sections} />
        </Disclosure>
      </div>
      {roadmap.description && (
        <p className="muted mb-5">{roadmap.description}</p>
      )}
      <p className="status-line mb-5">
        <span>
          {roadmap.progress.done} of {roadmap.progress.total} done
        </span>
        {roadmap.progress.inProgress > 0 && (
          <span>{roadmap.progress.inProgress} in progress</span>
        )}
        {roadmap.progress.asked > 0 && (
          <span>{roadmap.progress.asked} came up in interviews</span>
        )}
        {due > 0 && (
          <span>
            <Link
              className="link"
              href={`/roadmap/${roadmap.id}?status=revision`}
            >
              {due} due for revision
            </Link>
          </span>
        )}
        {roadmap.next && (
          <span>
            Continue:{' '}
            <a className="link" href={`#item-${roadmap.next.id}`}>
              {roadmap.next.title}
            </a>
          </span>
        )}
        <Disclosure variant="link" label="Edit roadmap">
          <RoadmapForm roadmap={roadmap} goals={goals} />
        </Disclosure>
      </p>
      {filtering && (
        <form className="dsa-filters mb-5" method="get" aria-label="Filters">
          <label>
            Show
            <select name="status" defaultValue={status}>
              {Object.entries(statusFilters).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue={priority || ''}>
              <option value="">Any</option>
              <option value="1">P0</option>
              <option value="2">P1</option>
              <option value="3">P2</option>
            </select>
          </label>
          <button className="button secondary">Apply</button>
          {(status !== 'all' || priority > 0) && (
            <span className="muted">
              {shown} of {roadmap.items.length} ·{' '}
              <Link className="link" href={`/roadmap/${roadmap.id}`}>
                Clear
              </Link>
            </span>
          )}
        </form>
      )}
      {!roadmap.items.length && (
        <section className="card">
          <p className="muted">
            Nothing here yet. Add items above: paste an outline, one line per
            item, and start a line with ? for a question.
          </p>
        </section>
      )}
      {sections.map((section) => {
        const all = roadmap.sections.get(section)!;
        const items = all.filter(keep);
        const done = all.filter((i) => i.status === 'DONE').length;
        if (!items.length) return null;
        return (
          <section
            className="card flat"
            key={section}
            aria-label={`${section} section`}
          >
            <div className="section-head">
              <h2>
                {section}{' '}
                <span className="muted">
                  · {done} of {all.length}
                </span>
              </h2>
            </div>
            <ol className="plain-list">
              {items.map((item) => {
                const references =
                  (item.references as Reference[] | null) ?? [];
                const hasStudy =
                  item.scope ||
                  item.checkpoint ||
                  references.length ||
                  item.notes ||
                  item.sourceRef;
                return (
                  <li
                    className={`roadmap-item is-${item.status.toLowerCase().replace('_', '-')}`}
                    key={item.id}
                    id={`item-${item.id}`}
                  >
                    <span className="roadmap-mark" aria-hidden="true">
                      {mark[item.status]}
                    </span>
                    <div className="roadmap-body">
                      <p className="roadmap-title">
                        <span className="sr-only">
                          {markText[item.status]}:{' '}
                        </span>
                        {item.title}
                        {item.priority === 1 && (
                          <span className="pill priority">P0</span>
                        )}
                        {item.priority === 3 && (
                          <span className="pill">P2</span>
                        )}
                        {item.kind === 'QUESTION' && (
                          <span className="pill info">Question</span>
                        )}
                        {item.askedInInterview && (
                          <span className="pill green">
                            Asked{item.askedNote ? ` · ${item.askedNote}` : ''}
                          </span>
                        )}
                        {item.estimateMinutes && (
                          <span className="muted roadmap-estimate">
                            {item.estimateMinutes} min
                          </span>
                        )}
                        {revisionState(item, today) === 'upcoming' && (
                          <span className="muted roadmap-estimate">
                            Revise {dateLabel(item.nextRevisionAt!)}
                          </span>
                        )}
                        {revisionState(item, today) === 'due' && (
                          <span className="pill yellow">Revise today</span>
                        )}
                        {revisionState(item, today) === 'overdue' && (
                          <span className="pill red">
                            Revision overdue · {dateLabel(item.nextRevisionAt!)}
                          </span>
                        )}
                      </p>
                      {(item.learningTopic ||
                        item.dsaProblem ||
                        item.dsaTopic ||
                        item.url) && (
                        <p className="muted roadmap-links">
                          {item.learningTopic && (
                            <Link
                              className="link"
                              href={`/learn/topics/${item.learningTopic.id}`}
                            >
                              {item.learningTopic.subject.name} —{' '}
                              {item.learningTopic.title}
                            </Link>
                          )}
                          {item.dsaProblem && (
                            <Link
                              className="link"
                              href={`/dsa/${item.dsaProblem.id}`}
                            >
                              Record an attempt
                            </Link>
                          )}
                          {item.dsaTopic && (
                            <span>Practice topic: {item.dsaTopic.name}</span>
                          )}
                          {item.url && (
                            <ResourceLink url={item.url}>
                              Open link
                            </ResourceLink>
                          )}
                        </p>
                      )}
                      <ItemControls item={item} />
                      <div className="roadmap-toggles">
                        <Disclosure variant="link" label="Study">
                          <div className="study-panel">
                            {item.scope && (
                              <p>
                                <strong>Scope.</strong>{' '}
                                <span className="learning-notes">
                                  {item.scope}
                                </span>
                              </p>
                            )}
                            {item.checkpoint && (
                              <p>
                                <strong>Done means.</strong>{' '}
                                <span className="learning-notes">
                                  {item.checkpoint}
                                </span>
                              </p>
                            )}
                            {references.length > 0 && (
                              <ul className="plain-list reference-list">
                                {references.map((r) => (
                                  <li key={r.url}>
                                    <ResourceLink url={r.url}>
                                      {r.label}
                                    </ResourceLink>
                                    {r.kind && (
                                      <span className="muted"> · {r.kind}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {item.notes && (
                              <p>
                                <strong>My notes.</strong>{' '}
                                <span className="learning-notes">
                                  {item.notes}
                                </span>
                              </p>
                            )}
                            {item.sourceRef && (
                              <p className="muted">From: {item.sourceRef}</p>
                            )}
                            {!hasStudy && (
                              <p className="muted">
                                No scope or notes yet. Edit the item to add what
                                to cover and what done means.
                              </p>
                            )}
                            <StudyPrompt
                              roadmap={{ title: roadmap.title }}
                              template={roadmap.promptTemplate}
                              scenarios={scenarios}
                              item={{
                                title: item.title,
                                section: item.section,
                                scope: item.scope,
                                checkpoint: item.checkpoint,
                                priority: item.priority,
                                estimateMinutes: item.estimateMinutes,
                                references,
                                notes: item.notes,
                                url: item.url,
                              }}
                            />
                          </div>
                        </Disclosure>
                        <Disclosure variant="link" label="Edit">
                          <ItemForm
                            item={item}
                            sections={sections}
                            links={links}
                          />
                        </Disclosure>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      {filtering && shown === 0 && roadmap.items.length > 0 && (
        <section className="card">
          <p className="muted">Nothing matches these filters.</p>
        </section>
      )}
    </>
  );
}
