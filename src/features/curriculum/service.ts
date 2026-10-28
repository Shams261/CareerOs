import 'server-only';
import { db } from '@/server/db';
import { forgetAll } from '@/server/memo';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import type { Bundle } from './bundle';
import { copyCurriculum } from './copy';

/** The one published bundle (WI-064), or null before the owner publishes it. */
export async function publishedBundle() {
  const row = await db().curriculumBundle.findUnique({
    where: { id: 'default' },
  });
  return row ? { ...row, bundle: row.payload as unknown as Bundle } : null;
}

/** What Settings shows: roadmap and problem counts, read in SQL so the bundle is not loaded. */
export async function curriculumSummary() {
  const rows = await db().$queryRaw<
    { roadmaps: number; problems: number; publishedAt: Date }[]
  >`SELECT jsonb_array_length(payload->'roadmaps')::int AS roadmaps,
           jsonb_array_length(payload->'dsa'->'problems')::int AS problems,
           "publishedAt"
    FROM "CurriculumBundle" WHERE id = 'default'`;
  return rows[0] ?? null;
}

/**
 * The first sign-in of a workspace gets the default curriculum (WI-064). It runs only while the
 * workspace has no curriculum roadmap, so a later sign-in never copies again; Restore in
 * Settings brings back anything missing. Without a published bundle it does nothing.
 */
export async function ensureCurriculum(userId: string) {
  const has = await db().roadmap.count({ where: { userId, curriculum: true } });
  if (has) return null;
  const published = await publishedBundle();
  if (!published) return null;
  const report = await locked(userId, (tx) =>
    copyCurriculum(tx, userId, published.bundle),
  );
  forgetAll();
  return report;
}

/** Settings → Restore default curriculum: everything missing, archived or hidden comes back. */
export async function restoreCurriculum(user: ScheduleUser) {
  const published = await publishedBundle();
  if (!published) throw new Error('No default curriculum is published yet.');
  return locked(user.id, (tx) => copyCurriculum(tx, user.id, published.bundle));
}
