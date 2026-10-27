import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { db, owner } from '@/server/db';
import { dayKey, shortDate } from '@/lib/time';
import { Disclosure } from '@/components/disclosure';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { AGENT_NAME } from '@/features/agent/domain';
import { AskRumiButton } from '@/features/agent/ask-button';
import { prepDoc } from '@/features/prep/service';
import { deletePrepDocAction } from '@/features/prep/actions';
import type { Link as ItemLink, Source } from '@/features/prep/domain';

export const metadata = { title: 'Prep doc' };

function Cites({ ids, sources }: { ids: string[]; sources: Source[] }) {
  return (
    <span className="prep-cites">
      {ids.map((id) => {
        const s = sources.find((x) => x.id === id);
        return s ? (
          <a
            key={id}
            href={`#source-${id}`}
            className="prep-cite"
            title={s.site}
          >
            {id}
          </a>
        ) : null;
      })}
    </span>
  );
}

/**
 * An interview prep doc (WI-042): research from the web with every point's sources, the
 * topics mapped to the owner's own roadmap items and problems, a seven-day plan, and
 * questions to ask. Sources are marked Official (the company's own site) or Other.
 */
export default async function PrepDocPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const user = await owner();
  const { id, docId } = await params;
  const row = await prepDoc(user, docId);
  if (!row || row.applicationId !== id) notFound();
  const { doc, cited } = row;
  const linked = [...doc.topics, ...doc.plan].flatMap((x) => x.links);
  // Links open the item where it lives now; one removed since reads as plain text.
  const [items, problems] = await Promise.all([
    db().roadmapItem.findMany({
      where: {
        userId: user.id,
        id: { in: linked.filter((l) => l.kind === 'roadmap').map((l) => l.id) },
      },
      select: { id: true, roadmapId: true, section: true },
    }),
    db().dsaProblem.findMany({
      where: {
        userId: user.id,
        id: { in: linked.filter((l) => l.kind === 'problem').map((l) => l.id) },
      },
      select: { id: true },
    }),
  ]);
  const href = (l: ItemLink) => {
    if (l.kind === 'problem')
      return problems.some((p) => p.id === l.id) ? `/dsa/${l.id}` : null;
    const i = items.find((x) => x.id === l.id);
    return i
      ? `/roadmap/${i.roadmapId}?section=${encodeURIComponent(i.section)}#item-${i.id}`
      : null;
  };
  const Links = ({ links }: { links: ItemLink[] }) =>
    links.length ? (
      <span className="prep-links">
        {links.map((l) => {
          const to = href(l);
          return to ? (
            <Link key={l.id} href={to} prefetch={false} className="prep-link">
              {l.title}
            </Link>
          ) : (
            <span key={l.id} className="prep-link">
              {l.title}
            </span>
          );
        })}
      </span>
    ) : null;
  const written = shortDate(dayKey(row.createdAt, user.timezone));
  return (
    <>
      <Link className="link" href={`/jobs/${id}`} prefetch={false}>
        <ArrowLeft size={14} aria-hidden="true" /> {row.company}
      </Link>
      <p className="eyebrow mt-4">Prepared with {AGENT_NAME}</p>
      <div className="page-head">
        <h1>
          {row.company} · {row.role}
        </h1>
      </div>
      <p className="today-summary">
        Written {written} from {cited.length} web{' '}
        {cited.length === 1 ? 'source' : 'sources'} ·{' '}
        {cited.filter((s) => s.official).length} official
        {row.usedJobDescription ? ' · with the job description' : ''}
      </p>
      <div className="prep-doc">
        {doc.process.length > 0 && (
          <section className="card" aria-labelledby="prep-process">
            <h2 id="prep-process">Process</h2>
            <ul className="prep-points">
              {doc.process.map((p, i) => (
                <li key={i}>
                  {p.text} <Cites ids={p.sources} sources={cited} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {doc.rounds.length > 0 && (
          <section className="card" aria-labelledby="prep-rounds">
            <h2 id="prep-rounds">What each round tests</h2>
            <ul className="prep-points">
              {doc.rounds.map((r, i) => (
                <li key={i}>
                  <strong>{r.name}</strong>{' '}
                  <Cites ids={r.sources} sources={cited} />
                  <ul>
                    {r.tests.map((t, j) => (
                      <li key={j}>{t}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
        {doc.topics.length > 0 && (
          <section className="card" aria-labelledby="prep-topics">
            <h2 id="prep-topics">Topics, and where they are in your study</h2>
            <ul className="prep-points">
              {doc.topics.map((t, i) => (
                <li key={i}>
                  <strong>{t.name}</strong>: {t.why}{' '}
                  <Cites ids={t.sources} sources={cited} />
                  <Links links={t.links} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {doc.plan.length > 0 && (
          <section className="card" aria-labelledby="prep-plan">
            <h2 id="prep-plan">Seven days</h2>
            <ol className="prep-plan">
              {doc.plan.map((p) => (
                <li key={p.day}>
                  <span className="prep-day">Day {p.day}</span>
                  <span>
                    {p.focus}
                    <Links links={p.links} />
                  </span>
                </li>
              ))}
            </ol>
            <AskRumiButton
              text={`Plan my next days from my ${row.company} prep doc.`}
              className="button mt-4"
            >
              Plan this with {AGENT_NAME}
            </AskRumiButton>
          </section>
        )}
        {doc.questions.length > 0 && (
          <section className="card" aria-labelledby="prep-questions">
            <h2 id="prep-questions">Questions to ask</h2>
            <ul className="prep-points">
              {doc.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        )}
        <section className="card" aria-labelledby="prep-sources">
          <h2 id="prep-sources">Sources</h2>
          <ol className="prep-sources">
            {cited.map((s) => (
              <li key={s.id} id={`source-${s.id}`}>
                <span className="prep-cite">{s.id}</span>
                <span className="prep-source-main">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    {s.title}
                  </a>
                  <span className="prep-source-meta">
                    <span
                      className={`prep-tier${s.official ? ' is-official' : ''}`}
                    >
                      {s.official ? 'Official' : 'Other'}
                    </span>
                    {s.site} · found {written}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="prep-note">
            Other sources are not checked by the company; weigh them as such.
          </p>
        </section>
        <Disclosure variant="link" label="Delete this doc">
          <ActionForm action={deletePrepDocAction} label="Delete this prep doc">
            <input type="hidden" name="id" value={row.id} />
            <Button className="destructive small">Delete</Button>
          </ActionForm>
        </Disclosure>
      </div>
    </>
  );
}
