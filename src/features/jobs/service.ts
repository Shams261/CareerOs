import 'server-only';
import { z } from 'zod';
import { db } from '@/server/db';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { PreviewRequired } from '@/features/schedule/editing';
import { dayBounds, dayKey } from '@/lib/time';
import { localTime } from '@/lib/validation';
import type { Prisma } from '@/generated/prisma/client';
import {
  detailsInput,
  duplicateKey,
  followUpDoneInput,
  followUpInput,
  interviewInterval,
  noteInput,
  prepInput,
  quickAddInput,
  rescheduleInput,
  resultInput,
  roundDetailsInput,
  roundInput,
  stageInput,
  weeklyJobSummary,
  isOpen,
  attentionQueue,
  followUpState,
  needsAction,
  nextRound,
} from './domain';

type Tx = Prisma.TransactionClient;
export const DUPLICATE_TOKEN = 'confirm-duplicate';

export async function ownedApplication(tx: Tx, userId: string, id: string) {
  const app = await tx.jobApplication.findFirst({ where: { id, userId } });
  if (!app) throw new Error('Application not found in your workspace.');
  return app;
}
export async function ownedRound(tx: Tx, userId: string, id: string) {
  const round = await tx.interviewRound.findFirst({
    where: { id, userId, application: { userId } },
    include: { application: true },
  });
  if (!round) throw new Error('Interview not found in your workspace.');
  return round;
}
/**
 * Replays an already-applied submission. A requestId reused for another application is rejected
 * instead of silently writing a second event.
 */
async function replayed(
  tx: Tx,
  userId: string,
  requestId: string,
  applicationId?: string,
) {
  const prior = await tx.jobActivity.findUnique({
    where: { userId_requestId: { userId, requestId } },
  });
  if (prior && applicationId && prior.applicationId !== applicationId)
    throw new Error(
      'This submission was already saved. Reload before trying again.',
    );
  return prior;
}

export async function createApplication(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = quickAddInput.parse(raw);
  return locked(user.id, async (tx) => {
    const prior = await replayed(tx, user.id, input.requestId);
    if (prior)
      return tx.jobApplication.findUniqueOrThrow({
        where: { id: prior.applicationId },
      });
    const key = duplicateKey(input);
    const similar = (
      await tx.jobApplication.findMany({
        where: {
          userId: user.id,
          company: { equals: input.company, mode: 'insensitive' },
        },
      })
    ).filter((a) => duplicateKey(a) === key);
    // Legitimate repeat applications are allowed after an explicit confirmation.
    if (similar.length && input.token !== DUPLICATE_TOKEN)
      throw new PreviewRequired(
        DUPLICATE_TOKEN,
        similar.map(
          (a) =>
            `${a.company} — ${a.role} already exists (${a.stage.toLowerCase().replaceAll('_', ' ')}${a.appliedAt ? `, applied ${a.appliedAt.toISOString().slice(0, 10)}` : ''}). Confirm to add another.`,
        ),
      );
    const appliedAt =
      input.stage === 'SAVED'
        ? null
        : new Date(input.appliedAt ?? dayKey(now, user.timezone));
    const app = await tx.jobApplication.create({
      data: {
        userId: user.id,
        company: input.company,
        role: input.role,
        jobUrl: input.jobUrl ?? null,
        source: input.source,
        stage: input.stage,
        appliedAt,
      },
    });
    await tx.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        type: 'CREATED',
        occurredAt: now,
        toStage: input.stage,
        requestId: input.requestId,
      },
    });
    return app;
  });
}

export async function updateDetails(user: ScheduleUser, raw: unknown) {
  const { id, appliedAt, jobUrl, ...data } = detailsInput.parse(raw);
  return locked(user.id, async (tx) => {
    await ownedApplication(tx, user.id, id);
    return tx.jobApplication.update({
      where: { id },
      data: {
        ...data,
        jobUrl: jobUrl ?? null,
        appliedAt: appliedAt ? new Date(appliedAt) : null,
      },
    });
  });
}

async function moveStage(
  tx: Tx,
  user: ScheduleUser,
  app: { id: string; stage: string; appliedAt: Date | null },
  stage: z.infer<typeof stageInput>['stage'],
  now: Date,
  note: string | null,
  requestId: string | null,
  interviewRoundId: string | null = null,
) {
  if (app.stage === stage)
    throw new Error('The application is already in that stage.');
  // Leaving SAVED records the owner-local application date if none was entered.
  const appliedAt =
    !app.appliedAt && stage !== 'SAVED' && app.stage === 'SAVED'
      ? new Date(dayKey(now, user.timezone))
      : undefined;
  await tx.jobApplication.update({
    where: { id: app.id },
    data: { stage, ...(appliedAt ? { appliedAt } : {}) },
  });
  return tx.jobActivity.create({
    data: {
      userId: user.id,
      applicationId: app.id,
      type: 'STAGE_CHANGED',
      occurredAt: now,
      fromStage: app.stage as typeof stage,
      toStage: stage,
      note,
      requestId,
      interviewRoundId,
    },
  });
}
export async function changeStage(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = stageInput.parse(raw);
  return locked(user.id, async (tx) => {
    const app = await ownedApplication(tx, user.id, input.id);
    const prior = await replayed(tx, user.id, input.requestId, app.id);
    if (prior) return prior;
    return moveStage(
      tx,
      user,
      app,
      input.stage,
      now,
      input.note,
      input.requestId,
    );
  });
}

export async function setFollowUp(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = followUpInput.parse(raw);
  return locked(user.id, async (tx) => {
    const app = await ownedApplication(tx, user.id, input.id);
    const data = {
      nextAction: input.nextAction,
      nextActionDate: input.nextActionDate
        ? new Date(input.nextActionDate)
        : null,
      actionOwner: input.actionOwner,
    };
    const changed =
      app.nextAction !== data.nextAction ||
      app.actionOwner !== data.actionOwner ||
      +(app.nextActionDate ?? 0) !== +(data.nextActionDate ?? 0);
    if (!changed) return app;
    await tx.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        type: 'FOLLOW_UP_SET',
        occurredAt: now,
        note: [
          data.nextAction ?? 'No next action',
          input.nextActionDate ? `due ${input.nextActionDate}` : null,
          data.actionOwner === 'COMPANY'
            ? 'waiting on company'
            : data.actionOwner === 'ME'
              ? 'my action'
              : null,
        ]
          .filter(Boolean)
          .join(' · '),
      },
    });
    return tx.jobApplication.update({ where: { id: app.id }, data });
  });
}
/** Completes the current next action and optionally sets the following one in one transaction. */
export async function completeFollowUp(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = followUpDoneInput.parse(raw);
  return locked(user.id, async (tx) => {
    const app = await ownedApplication(tx, user.id, input.id);
    const prior = await replayed(tx, user.id, input.requestId, app.id);
    if (prior) return prior;
    if (!app.nextAction && !app.nextActionDate)
      throw new Error('There is no next action to complete.');
    const done = await tx.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        type: 'FOLLOW_UP_DONE',
        occurredAt: now,
        note: [app.nextAction ?? 'Follow-up', input.note]
          .filter(Boolean)
          .join(' — '),
        requestId: input.requestId,
      },
    });
    await tx.jobApplication.update({
      where: { id: app.id },
      data: {
        nextAction: input.nextAction,
        nextActionDate: input.nextActionDate
          ? new Date(input.nextActionDate)
          : null,
        actionOwner: input.actionOwner,
      },
    });
    return done;
  });
}

export async function scheduleRound(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = roundInput.parse(raw);
  const interval = interviewInterval(input);
  return locked(user.id, async (tx) => {
    const app = await ownedApplication(tx, user.id, input.applicationId);
    const prior = await replayed(tx, user.id, input.requestId, app.id);
    if (prior)
      return tx.interviewRound.findUniqueOrThrow({
        where: { id: prior.interviewRoundId! },
      });
    if (!isOpen(app.stage))
      throw new Error('Reopen this application before scheduling interviews.');
    const round = await tx.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: input.title,
        type: input.type,
        timezone: input.timezone,
        interviewers: input.interviewers,
        meetingUrl: input.meetingUrl ?? null,
        location: input.location,
        notes: input.notes,
        ...interval,
      },
    });
    await tx.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        interviewRoundId: round.id,
        type: 'INTERVIEW_SCHEDULED',
        occurredAt: now,
        newStart: round.scheduledStart,
        note: round.title,
        requestId: input.requestId,
      },
    });
    return round;
  });
}
export async function updateRoundDetails(user: ScheduleUser, raw: unknown) {
  const { id, meetingUrl, ...data } = roundDetailsInput.parse(raw);
  return locked(user.id, async (tx) => {
    await ownedRound(tx, user.id, id);
    return tx.interviewRound.update({
      where: { id },
      data: { ...data, meetingUrl: meetingUrl ?? null },
    });
  });
}
/** Moves a scheduled or cancelled round; the previous time is preserved in the timeline. */
export async function rescheduleRound(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = rescheduleInput.parse(raw);
  const interval = interviewInterval(input);
  return locked(user.id, async (tx) => {
    const round = await ownedRound(tx, user.id, input.id);
    const prior = await replayed(
      tx,
      user.id,
      input.requestId,
      round.applicationId,
    );
    if (prior) return round;
    if (!['SCHEDULED', 'CANCELLED', 'NO_SHOW'].includes(round.status))
      throw new Error('Completed interviews cannot be rescheduled.');
    if (
      +round.scheduledStart === +interval.scheduledStart &&
      +(round.scheduledEnd ?? 0) === +(interval.scheduledEnd ?? 0)
    )
      throw new Error('Choose a different time to reschedule.');
    await tx.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: round.applicationId,
        interviewRoundId: round.id,
        type: 'INTERVIEW_RESCHEDULED',
        occurredAt: now,
        previousStart: round.scheduledStart,
        newStart: interval.scheduledStart,
        note: [round.title, input.note].filter(Boolean).join(' — '),
        requestId: input.requestId,
      },
    });
    return tx.interviewRound.update({
      where: { id: round.id },
      data: { ...interval, timezone: input.timezone, status: 'SCHEDULED' },
    });
  });
}
/** Records the outcome/reflection, and optionally moves the application stage in the same transaction. */
export async function recordRoundResult(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = resultInput.parse(raw);
  return locked(user.id, async (tx) => {
    const round = await ownedRound(tx, user.id, input.id);
    const prior = await replayed(
      tx,
      user.id,
      input.requestId,
      round.applicationId,
    );
    if (prior) return round;
    const reflection = {
      outcomeNotes: input.outcomeNotes,
      topicsAsked: input.topicsAsked,
      wentWell: input.wentWell,
      toImprove: input.toImprove,
    };
    // A recorded result is final; its reflection can still be written later.
    if (round.status === 'COMPLETED') {
      if (input.status !== 'COMPLETED' || input.stage)
        throw new Error(
          'This interview is already completed. Only the reflection can change.',
        );
      return tx.interviewRound.update({
        where: { id: round.id },
        data: reflection,
      });
    }
    if (input.status === 'COMPLETED' && round.scheduledStart > now)
      throw new Error('An interview cannot be completed before it starts.');
    const updated = await tx.interviewRound.update({
      where: { id: round.id },
      data: {
        status: input.status,
        ...reflection,
        completedAt: input.status === 'COMPLETED' ? now : null,
      },
    });
    await tx.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: round.applicationId,
        interviewRoundId: round.id,
        type: 'INTERVIEW_RESULT',
        occurredAt: now,
        note: `${round.title}: ${input.status.toLowerCase().replace('_', ' ')}`,
        requestId: input.requestId,
      },
    });
    if (input.stage && input.stage !== round.application.stage)
      await moveStage(
        tx,
        user,
        round.application,
        input.stage,
        now,
        `After ${round.title}`,
        null,
        round.id,
      );
    return updated;
  });
}

async function validateLinks(
  tx: Tx,
  userId: string,
  links: {
    learningTopicId: string | null;
    dsaProblemId: string | null;
    dsaTopicId: string | null;
  },
) {
  if (
    links.learningTopicId &&
    !(await tx.learningTopic.findFirst({
      where: { id: links.learningTopicId, userId },
    }))
  )
    throw new Error('Linked learning topic not found in your workspace.');
  if (
    links.dsaProblemId &&
    !(await tx.dsaProblem.findFirst({
      where: { id: links.dsaProblemId, userId },
    }))
  )
    throw new Error('Linked DSA problem not found in your workspace.');
  if (
    links.dsaTopicId &&
    !(await tx.dsaTopic.findUnique({ where: { id: links.dsaTopicId } }))
  )
    throw new Error('Linked DSA topic not found.');
}
/** Prep items reference learning/DSA entities; nothing is copied and no assessment/attempt is created. */
export async function addPrepItem(user: ScheduleUser, raw: unknown) {
  const input = prepInput.parse(raw);
  return locked(user.id, async (tx) => {
    await ownedRound(tx, user.id, input.roundId);
    await validateLinks(tx, user.id, input);
    const ordering = await tx.interviewPrepItem.count({
      where: { roundId: input.roundId },
    });
    return tx.interviewPrepItem.create({
      data: { ...input, userId: user.id, ordering },
    });
  });
}
/** Explicit target state keeps repeated submissions idempotent. */
export async function setPrepItemDone(
  user: ScheduleUser,
  id: string,
  completed: boolean,
  now = new Date(),
) {
  return locked(user.id, async (tx) => {
    const item = await tx.interviewPrepItem.findFirst({
      where: { id, userId: user.id, round: { userId: user.id } },
    });
    if (!item) throw new Error('Prep item not found in your workspace.');
    if (item.completed === completed) return item;
    return tx.interviewPrepItem.update({
      where: { id },
      data: { completed, completedAt: completed ? now : null },
    });
  });
}
export async function addJobNote(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = noteInput.parse(raw);
  return locked(user.id, async (tx) => {
    const app = await ownedApplication(tx, user.id, input.id);
    const prior = await replayed(tx, user.id, input.requestId, app.id);
    if (prior) return prior;
    return tx.jobActivity.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        type: 'NOTE',
        occurredAt: now,
        note: input.note,
        requestId: input.requestId,
      },
    });
  });
}

export async function saveJobReminders(user: ScheduleUser, raw: unknown) {
  const input = z
    .object({
      followUpEnabled: z.boolean(),
      followUpTime: localTime,
      interviewEnabled: z.boolean(),
      interviewOffset: z.coerce.number().int().min(10).max(240),
    })
    .parse(raw);
  return locked(user.id, async (tx) => {
    for (const [type, data] of [
      [
        'JOB_FOLLOW_UP',
        { enabled: input.followUpEnabled, preferredTime: input.followUpTime },
      ],
      [
        'INTERVIEW',
        {
          enabled: input.interviewEnabled,
          offsetMinutes: input.interviewOffset,
        },
      ],
    ] as const)
      await tx.notificationPreference.upsert({
        where: { userId_type: { userId: user.id, type } },
        create: { ...data, userId: user.id, type, timezone: user.timezone },
        update: { ...data, timezone: user.timezone },
      });
  });
}

const roundOrder = [{ scheduledStart: 'asc' as const }, { id: 'asc' as const }];
export async function jobSnapshot(user: ScheduleUser, now = new Date()) {
  const [apps, activities, sessions, block, prefs] = await Promise.all([
    db().jobApplication.findMany({
      where: { userId: user.id },
      include: {
        rounds: {
          where: { userId: user.id },
          orderBy: roundOrder,
          include: { prepItems: { select: { completed: true } } },
        },
        activities: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    }),
    db().jobActivity.findMany({
      where: {
        userId: user.id,
        occurredAt: { gte: new Date(+now - 8 * 86400000) },
      },
      select: { type: true, toStage: true, occurredAt: true },
    }),
    db().actualSession.findMany({
      where: {
        userId: user.id,
        startedAt: { gte: new Date(+now - 8 * 86400000) },
      },
      select: { category: true, startedAt: true, endedAt: true },
    }),
    db().timeBlock.findFirst({
      where: {
        dailyPlan: { userId: user.id },
        category: { equals: 'JOB_SEARCH', mode: 'insensitive' },
        plannedEnd: { gt: now },
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: { plannedStart: 'asc' },
    }),
    db().notificationPreference.findMany({
      where: { userId: user.id, type: { in: ['JOB_FOLLOW_UP', 'INTERVIEW'] } },
    }),
  ]);
  const weekly = weeklyJobSummary(
    {
      apps,
      rounds: apps.flatMap((a) => a.rounds),
      activities,
      sessions,
    },
    now,
    user.timezone,
  );
  return {
    apps: apps.map((a) => ({
      ...a,
      lastActivityAt: a.activities[0]?.occurredAt ?? a.createdAt,
    })),
    weekly,
    block,
    followUpPref: prefs.find((p) => p.type === 'JOB_FOLLOW_UP') ?? null,
    interviewPref: prefs.find((p) => p.type === 'INTERVIEW') ?? null,
  };
}
export async function applicationDetail(user: ScheduleUser, id: string) {
  return db().jobApplication.findFirst({
    where: { id, userId: user.id },
    include: {
      rounds: {
        where: { userId: user.id },
        orderBy: roundOrder,
        include: {
          prepItems: {
            where: { userId: user.id },
            orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
            include: {
              learningTopic: { include: { subject: true } },
              dsaProblem: true,
              dsaTopic: true,
            },
          },
        },
      },
      activities: {
        where: { userId: user.id },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        include: { interviewRound: { select: { title: true } } },
      },
      resources: { where: { userId: user.id } },
    },
  });
}

/** Scheduled interviews starting within the owner's calendar day. */
export async function todaysInterviews(user: ScheduleUser, day: string) {
  const bounds = dayBounds(day, user.timezone);
  return db().interviewRound.findMany({
    where: {
      userId: user.id,
      status: 'SCHEDULED',
      scheduledStart: { gte: bounds.start, lt: bounds.end },
      application: {
        userId: user.id,
        stage: { notIn: ['REJECTED', 'WITHDRAWN'] },
      },
    },
    include: {
      application: true,
      prepItems: { select: { completed: true } },
    },
    orderBy: { scheduledStart: 'asc' },
  });
}
/** Compact Today facts. Null when the owner has no open application. */
export async function jobTodaySummary(user: ScheduleUser, now = new Date()) {
  const [apps, block] = await Promise.all([
    db().jobApplication.findMany({
      where: { userId: user.id, stage: { notIn: ['REJECTED', 'WITHDRAWN'] } },
      include: {
        rounds: { where: { userId: user.id }, orderBy: roundOrder },
      },
    }),
    db().timeBlock.findFirst({
      where: {
        dailyPlan: { userId: user.id },
        category: { equals: 'JOB_SEARCH', mode: 'insensitive' },
        plannedEnd: { gt: now },
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: { plannedStart: 'asc' },
    }),
  ]);
  if (!apps.length) return null;
  const today = dayKey(now, user.timezone);
  const upcoming = apps
    .flatMap((a) => {
      const round = nextRound(a.rounds, now);
      return round ? [{ app: a, round }] : [];
    })
    .sort((a, b) => +a.round.scheduledStart - +b.round.scheduledStart)[0];
  return {
    actionRequired: apps.filter(needsAction).length,
    followUpsDue: apps.filter((a) =>
      ['overdue', 'today'].includes(followUpState(a, today).state),
    ).length,
    attention: attentionQueue(apps, now, user.timezone),
    upcoming: upcoming ?? null,
    block,
  };
}
