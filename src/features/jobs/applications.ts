import 'server-only';
import { DUPLICATE_TOKEN, ownedApplication, replayed, type Tx } from './owned';
import { renameScheduleBlock } from './round-blocks';
import { z } from 'zod';
import { locked, type ScheduleUser } from '@/server/lock';
import { PreviewRequired } from '@/features/schedule/editing';
import { dayKey } from '@/lib/time';
import { localTime } from '@/lib/validation';
import {
  detailsInput,
  duplicateKey,
  followUpDoneInput,
  followUpInput,
  noteInput,
  quickAddInput,
  scheduleBlockTitle,
  stageInput,
} from './domain';

/** Applications: create, details, stage, the next action, notes and reminders (WI-132). */
export async function createApplication(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = quickAddInput.parse(raw);
  return locked(user.id, (tx) => createApplicationIn(tx, user, input, now));
}

/** An application added inside the caller's owner lock (WI-118: Rumi's card). */
export async function createApplicationIn(
  tx: Tx,
  user: ScheduleUser,
  input: z.infer<typeof quickAddInput>,
  now = new Date(),
) {
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
}

export async function updateDetails(user: ScheduleUser, raw: unknown) {
  const { id, appliedAt, jobUrl, ...data } = detailsInput.parse(raw);
  return locked(user.id, async (tx) => {
    const before = await ownedApplication(tx, user.id, id);
    const updated = await tx.jobApplication.update({
      where: { id },
      data: {
        ...data,
        jobUrl: jobUrl ?? null,
        appliedAt: appliedAt ? new Date(appliedAt) : null,
      },
    });
    if (before.company !== updated.company) {
      const rounds = await tx.interviewRound.findMany({
        where: { applicationId: id, userId: user.id },
        select: { id: true, title: true },
      });
      for (const r of rounds)
        await renameScheduleBlock(
          tx,
          user,
          r.id,
          scheduleBlockTitle(before.company, r.title),
          scheduleBlockTitle(updated.company, r.title),
        );
    }
    return updated;
  });
}

export async function moveStage(
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
  return locked(user.id, (tx) => changeStageIn(tx, user, raw, now));
}

/** `changeStage` inside a transaction that holds the owner lock (Rumi's cards, WI-103). */
export async function changeStageIn(
  tx: Tx,
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = stageInput.parse(raw);
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
