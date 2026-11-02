import { notFound } from 'next/navigation';
import { owner } from '@/server/db';
import { applicationDetail } from '@/features/jobs/service';
import { applicationPage } from '@/features/jobs/page-data';
import { ApplicationHead } from '@/features/jobs/application/head';
import { NextMove } from '@/features/jobs/application/next-move';
import { Interviews } from '@/features/jobs/application/interviews';
import { FormatsCard } from '@/features/jobs/application/formats-card';
import { Timeline } from '@/features/jobs/application/timeline';
import { ApplicationRail } from '@/features/jobs/application/rail';
/** The tab names the company; an id that is not the owner's answers 404 (WI-090). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [user, { id }] = await Promise.all([owner(), params]);
  const app = await applicationDetail(user, id);
  if (!app) notFound();
  return { title: `${app.company} · Jobs` };
}

/** One application (WI-022, redrawn in WI-096): its sections read from one loader (WI-126). */
export default async function Application({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await owner(),
    { id } = await params;
  const v = await applicationPage(user, id, new Date());
  if (!v) notFound();
  return (
    <>
      <ApplicationHead v={v} />
      <div className="grid-main">
        <section>
          <NextMove v={v} />
          <Interviews v={v} />
          {v.open && <FormatsCard v={v} />}
          <Timeline v={v} />
        </section>
        <aside>
          <ApplicationRail v={v} />
        </aside>
      </div>
    </>
  );
}
