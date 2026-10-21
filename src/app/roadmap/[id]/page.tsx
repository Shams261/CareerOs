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
import { linkOptions, roadmapDetail } from '@/features/roadmap/service';

const mark = { NOT_STARTED: '○', IN_PROGRESS: '◐', DONE: '✓' } as const;
const markText = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
} as const;

export default async function RoadmapDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await owner(),
    { id } = await params,
    roadmap = await roadmapDetail(user, id);
  if (!roadmap) notFound();
  const [links, goals] = await Promise.all([
    linkOptions(user.id),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
  ]);
  const sections = [...roadmap.sections.keys()];
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
      </p>
      {!roadmap.items.length && (
        <section className="card">
          <p className="muted">
            Nothing here yet. Add items above: paste an outline, one line per
            item, and start a line with ? for a question.
          </p>
        </section>
      )}
      {sections.map((section) => {
        const items = roadmap.sections.get(section)!;
        const done = items.filter((i) => i.status === 'DONE').length;
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
                  · {done} of {items.length}
                </span>
              </h2>
              <Disclosure variant="link" label="Add to this section">
                <BulkItemsForm
                  roadmapId={roadmap.id}
                  sections={sections}
                  section={section}
                />
              </Disclosure>
            </div>
            <ol className="plain-list">
              {items.map((item) => (
                <li
                  className={`roadmap-item is-${item.status.toLowerCase().replace('_', '-')}`}
                  key={item.id}
                >
                  <span className="roadmap-mark" aria-hidden="true">
                    {mark[item.status]}
                  </span>
                  <div className="roadmap-body">
                    <p className="roadmap-title">
                      <span className="sr-only">{markText[item.status]}: </span>
                      {item.title}
                      {item.kind === 'QUESTION' && (
                        <span className="pill info">Question</span>
                      )}
                      {item.askedInInterview && (
                        <span className="pill green">
                          Asked{item.askedNote ? ` · ${item.askedNote}` : ''}
                        </span>
                      )}
                    </p>
                    {(item.learningTopic ||
                      item.dsaProblem ||
                      item.dsaTopic ||
                      item.url ||
                      item.notes) && (
                      <p className="muted">
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
                            Problem: {item.dsaProblem.title}
                          </Link>
                        )}
                        {item.dsaTopic && (
                          <span>Practice topic: {item.dsaTopic.name}</span>
                        )}
                        {item.url && (
                          <>
                            {' '}
                            <ResourceLink url={item.url}>
                              Open link
                            </ResourceLink>
                          </>
                        )}
                        {item.notes && (
                          <span className="learning-notes"> {item.notes}</span>
                        )}
                      </p>
                    )}
                    <ItemControls item={item} />
                    <Disclosure variant="link" label="Edit">
                      <ItemForm item={item} sections={sections} links={links} />
                    </Disclosure>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      <Disclosure label="Edit roadmap">
        <section className="card">
          <RoadmapForm roadmap={roadmap} goals={goals} />
        </section>
      </Disclosure>
    </>
  );
}
