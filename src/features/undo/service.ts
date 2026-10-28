import 'server-only';
import { z } from 'zod';
import { db } from '@/server/db';
import { Prisma } from '@/generated/prisma/client';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { execute } from '@/features/execution/service';
import { addNote } from '@/features/notes/service';
import { addPriority, removePriority } from '@/features/review/service';
import { changeStage } from '@/features/jobs/service';
import { stages } from '@/features/jobs/domain';
import { randomUUID } from 'node:crypto';
import { setRestDay } from '@/features/nudges/service';
import { cardInput, keepCard } from '@/features/ai/service';
import { reopenProposal } from '@/features/agent/plans';
import { followPractice } from '@/features/roadmap/follow';
import { unhideProblem } from '@/features/deletes/service';

/**
 * Undo for destructive one-click actions (WI-011). Nothing is soft-deleted: an undo re-creates
 * the record from the payload the action handed back, always under the signed-in owner, so a
 * tampered payload can only ever create the owner's own data.
 */
const kinds = {
  'block-reset': z.object({ id: z.string().min(1) }),
  // Let go of yesterday's blocks in one step (WI-059).
  'blocks-reset': z.object({
    ids: z.array(z.string().min(1)).min(1).max(50),
  }),
  // Deletes on every record (WI-060).
  'restore-prep-item': z.object({
    roundId: z.string().min(1),
    kind: z.enum(['PREP', 'GAP']),
    title: z.string().min(1).max(300),
    notes: z.string().max(2000).nullable().optional(),
    completed: z.boolean().optional(),
    learningTopicId: z.string().nullable().optional(),
    dsaProblemId: z.string().nullable().optional(),
    dsaTopicId: z.string().nullable().optional(),
  }),
  'restore-session': z.object({
    taskId: z.string().nullable().optional(),
    goalId: z.string().nullable().optional(),
    category: z.string().min(1).max(80),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    notes: z.string().max(1000).nullable().optional(),
    attemptIds: z.array(z.string().min(1)).max(200).optional(),
    activityIds: z.array(z.string().min(1)).max(200).optional(),
  }),
  'problem-unhide': z.object({ id: z.string().min(1) }),
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
  /** A block just added: undo cancels it (the execution history stays append-only). */
  'cancel-block': z.object({ id: z.string().min(1) }),
  /** A priority just added: undo removes it. */
  'remove-priority': z.object({ id: z.string().min(1) }),
  /** A stage change undone: the application goes back to the stage it left. */
  'restore-stage': z.object({ id: z.string().min(1), stage: z.enum(stages) }),
  /** Reopen undone: the item's status and revision schedule as they were. */
  'restore-roadmap-state': z.object({
    id: z.string().min(1),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']),
    completedAt: z.string().nullable().optional(),
    nextRevisionAt: z.string().nullable().optional(),
    revisionStage: z.number().int().min(0),
  }),
  /** A rest day just marked (WI-028): undo makes it an ordinary day again. */
  'clear-rest-day': z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  /** A kept card just removed (WI-031): undo keeps it again. */
  'restore-card': cardInput,
  /** A Rumi plan just added (WI-041): undo cancels its blocks and reopens the card. */
  'cancel-blocks': z.object({
    ids: z.array(z.string().min(1)).min(1).max(6),
    messageId: z.string().min(1),
    proposalId: z.string().min(1),
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
    case 'blocks-reset': {
      const { ids } = kinds[k].parse(payload);
      for (const id of ids) await execute(user, id, 'reset');
      return ids.length === 1
        ? 'Block restored.'
        : `${ids.length} blocks restored.`;
    }
    case 'restore-prep-item': {
      const p = kinds[k].parse(payload);
      const round = await db().interviewRound.findFirst({
        where: { id: p.roundId, userId: user.id },
      });
      if (!round) throw new Error('The interview no longer exists.');
      // Links come back only when they still point at the owner's own records.
      const own = async <T>(
        id: string | null | undefined,
        find: () => Promise<T | null>,
      ) => (id && (await find()) ? id : null);
      await db().interviewPrepItem.create({
        data: {
          userId: user.id,
          roundId: round.id,
          kind: p.kind,
          title: p.title,
          notes: p.notes ?? null,
          completed: p.completed ?? false,
          learningTopicId: await own(p.learningTopicId, () =>
            db().learningTopic.findFirst({
              where: { id: p.learningTopicId!, userId: user.id },
            }),
          ),
          dsaProblemId: await own(p.dsaProblemId, () =>
            db().dsaProblem.findFirst({
              where: { id: p.dsaProblemId!, userId: user.id },
            }),
          ),
          dsaTopicId: await own(p.dsaTopicId, () =>
            db().dsaTopic.findFirst({ where: { id: p.dsaTopicId! } }),
          ),
        },
      });
      return 'Prep item restored.';
    }
    case 'restore-session': {
      const p = kinds[k].parse(payload);
      // Under the owner lock like every session write (WI-062), and the attempts and
      // activities recorded from it are linked again, if still the owner's and unlinked.
      await locked(user.id, async (tx) => {
        const task = p.taskId
          ? await tx.timeBlock.findFirst({
              where: { id: p.taskId, dailyPlan: { userId: user.id } },
            })
          : null;
        const goal = p.goalId
          ? await tx.goal.findFirst({
              where: { id: p.goalId, userId: user.id },
            })
          : null;
        const session = await tx.actualSession.create({
          data: {
            userId: user.id,
            taskId: task?.id ?? null,
            goalId: goal?.id ?? null,
            category: p.category,
            startedAt: new Date(p.startedAt),
            endedAt: new Date(p.endedAt),
            notes: p.notes ?? null,
          },
        });
        if (p.attemptIds?.length)
          await tx.dsaAttempt.updateMany({
            where: {
              id: { in: p.attemptIds },
              userId: user.id,
              actualSessionId: null,
            },
            data: { actualSessionId: session.id },
          });
        if (p.activityIds?.length)
          await tx.learningActivity.updateMany({
            where: {
              id: { in: p.activityIds },
              userId: user.id,
              actualSessionId: null,
            },
            data: { actualSessionId: session.id },
          });
      });
      return 'Session restored.';
    }
    case 'problem-unhide': {
      await unhideProblem(user, kinds[k].parse(payload).id);
      return 'Problem shown again.';
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
      const restored = await db().roadmapItem.create({
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
      // A problem item takes its status from Practice again, not from the removed copy.
      if (problem) await followPractice(db(), user.id, { itemId: restored.id });
      return 'Item restored.';
    }
    case 'cancel-block': {
      const { id } = kinds[k].parse(payload);
      await execute(user, id, 'cancel');
      return 'Block cancelled.';
    }
    case 'remove-priority': {
      const { id } = kinds[k].parse(payload);
      await removePriority(user, id);
      return 'Priority removed.';
    }
    case 'restore-stage': {
      const p = kinds[k].parse(payload);
      await changeStage(user, {
        id: p.id,
        stage: p.stage,
        requestId: randomUUID(),
        note: 'Stage change undone',
      });
      return 'Stage restored.';
    }
    case 'restore-roadmap-state': {
      const p = kinds[k].parse(payload);
      const item = await db().roadmapItem.findFirst({
        where: { id: p.id, userId: user.id },
      });
      if (!item) throw new Error('The item no longer exists.');
      await db().roadmapItem.update({
        where: { id: item.id },
        data: {
          status: p.status,
          completedAt: p.completedAt ? new Date(p.completedAt) : null,
          nextRevisionAt: p.nextRevisionAt ? new Date(p.nextRevisionAt) : null,
          revisionStage: p.revisionStage,
        },
      });
      return 'Item restored with its revision schedule.';
    }
    case 'clear-rest-day': {
      const { day } = kinds[k].parse(payload);
      await setRestDay(user, day, false);
      return 'Not a rest day any more.';
    }
    case 'restore-card': {
      await keepCard(user, kinds[k].parse(payload));
      return 'Card kept again.';
    }
    case 'cancel-blocks': {
      const p = kinds[k].parse(payload);
      for (const id of p.ids) await execute(user, id, 'cancel');
      await reopenProposal(user, p.messageId, p.proposalId);
      return p.ids.length === 1 ? 'Block cancelled.' : 'Blocks cancelled.';
    }
  }
}
