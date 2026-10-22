import 'server-only';
import { z } from 'zod';
import { db } from '@/server/db';
import { Prisma } from '@/generated/prisma/client';
import type { ScheduleUser } from '@/features/schedule/service';
import { execute } from '@/features/execution/service';
import { addNote } from '@/features/notes/service';
import { addPriority } from '@/features/review/service';

/**
 * Undo for destructive one-click actions (WI-011). Nothing is soft-deleted: an undo re-creates
 * the record from the payload the action handed back, always under the signed-in owner, so a
 * tampered payload can only ever create the owner's own data.
 */
const kinds = {
  'block-reset': z.object({ id: z.string().min(1) }),
  'restore-note': z.object({ body: z.string().min(1).max(500) }),
  'restore-priority': z.object({
    weekStart: z.string(),
    title: z.string().min(1).max(160),
    category: z.string().max(60).nullable().optional(),
    goalId: z.string().max(60).nullable().optional(),
    target: z.number().int().min(1).max(1000).nullable().optional(),
    targetUnit: z.string().max(40).nullable().optional(),
  }),
  'restore-roadmap-item': z.object({
    roadmapId: z.string().min(1),
    section: z.string().min(1).max(120),
    kind: z.enum(['CONCEPT', 'QUESTION']),
    title: z.string().min(1).max(200),
    notes: z.string().max(20000).nullable().optional(),
    url: z.string().max(2000).nullable().optional(),
    slug: z.string().max(200).nullable().optional(),
    scope: z.string().max(8000).nullable().optional(),
    checkpoint: z.string().max(4000).nullable().optional(),
    priority: z.number().int().min(1).max(3).optional(),
    estimateMinutes: z.number().int().nullable().optional(),
    references: z.unknown().optional(),
    sourceRef: z.string().max(200).nullable().optional(),
    nextRevisionAt: z.string().nullable().optional(),
    revisionStage: z.number().int().optional(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']),
    askedInInterview: z.boolean(),
    askedNote: z.string().max(200).nullable().optional(),
    ordering: z.number().int(),
    learningTopicId: z.string().nullable().optional(),
    dsaProblemId: z.string().nullable().optional(),
    dsaTopicId: z.string().nullable().optional(),
  }),
} as const;
export type UndoKind = keyof typeof kinds;
export type Undo = { kind: UndoKind; payload: unknown; label?: string };

export async function restore(
  user: ScheduleUser,
  kind: string,
  payload: unknown,
) {
  if (!(kind in kinds)) throw new Error('Nothing to undo.');
  const k = kind as UndoKind;
  switch (k) {
    case 'block-reset': {
      const { id } = kinds[k].parse(payload);
      await execute(user, id, 'reset');
      return 'Block restored.';
    }
    case 'restore-note': {
      await addNote(user, kinds[k].parse(payload));
      return 'Note restored.';
    }
    case 'restore-priority': {
      const p = kinds[k].parse(payload);
      await addPriority(user, {
        weekStart: p.weekStart,
        title: p.title,
        category: p.category ?? '',
        goalId: p.goalId ?? '',
        target: p.target ?? '',
        targetUnit: p.targetUnit ?? '',
      });
      return 'Priority restored.';
    }
    case 'restore-roadmap-item': {
      const p = kinds[k].parse(payload);
      const roadmap = await db().roadmap.findFirst({
        where: { id: p.roadmapId, userId: user.id },
      });
      if (!roadmap) throw new Error('The roadmap no longer exists.');
      // Links are kept only when they still point at the owner's own records.
      const [topic, problem, dsaTopic] = await Promise.all([
        p.learningTopicId
          ? db().learningTopic.findFirst({
              where: { id: p.learningTopicId, userId: user.id },
            })
          : null,
        p.dsaProblemId
          ? db().dsaProblem.findFirst({
              where: { id: p.dsaProblemId, userId: user.id },
            })
          : null,
        p.dsaTopicId
          ? db().dsaTopic.findFirst({ where: { id: p.dsaTopicId } })
          : null,
      ]);
      await db().roadmapItem.create({
        data: {
          userId: user.id,
          roadmapId: roadmap.id,
          section: p.section,
          kind: p.kind,
          title: p.title,
          notes: p.notes ?? null,
          url: p.url ?? null,
          slug: p.slug ?? null,
          scope: p.scope ?? null,
          checkpoint: p.checkpoint ?? null,
          priority: p.priority ?? 2,
          estimateMinutes: p.estimateMinutes ?? null,
          references:
            p.references == null
              ? Prisma.DbNull
              : (p.references as Prisma.InputJsonValue),
          sourceRef: p.sourceRef ?? null,
          nextRevisionAt: p.nextRevisionAt ? new Date(p.nextRevisionAt) : null,
          revisionStage: p.revisionStage ?? 0,
          status: p.status,
          completedAt: p.status === 'DONE' ? new Date() : null,
          askedInInterview: p.askedInInterview,
          askedNote: p.askedNote ?? null,
          ordering: p.ordering,
          learningTopicId: topic?.id ?? null,
          dsaProblemId: problem?.id ?? null,
          dsaTopicId: dsaTopic?.id ?? null,
        },
      });
      return 'Item restored.';
    }
  }
}
