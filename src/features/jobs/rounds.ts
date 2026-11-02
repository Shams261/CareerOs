import 'server-only';
import {
  moveScheduleBlock,
  renameScheduleBlock,
  settleScheduleBlock,
} from './round-blocks';
import { ownedApplication, ownedRound, replayed, type Tx } from './owned';
import { moveStage } from './applications';
import { typeText } from './formats';
import { z } from 'zod';
import { locked, type ScheduleUser } from '@/server/lock';
import {
  interviewInterval,
  isOpen,
  rescheduleInput,
  resultInput,
  roundDetailsInput,
  roundInput,
  scheduleBlockTitle,
} from './domain';

/** Interview rounds: schedule, details, reschedule and the result (WI-132). */
export async function scheduleRound(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = roundInput.parse(raw);
  return locked(user.id, (tx) => scheduleRoundIn(tx, user, input, now));
}

/** A round scheduled inside the caller's owner lock (WI-118: Rumi's card). */
export async function scheduleRoundIn(
  tx: Tx,
  user: ScheduleUser,
  input: z.infer<typeof roundInput>,
  now = new Date(),
) {
  const interval = interviewInterval(input);
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
      // The type is the title unless the owner wrote one ("Coding", "System design").
      title: input.title || typeText(input.type),
      type: input.type,
      aiPolicy: input.aiPolicy,
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
}

export async function updateRoundDetails(user: ScheduleUser, raw: unknown) {
  const { id, meetingUrl, ...data } = roundDetailsInput.parse(raw);
  return locked(user.id, async (tx) => {
    const before = await ownedRound(tx, user.id, id);
    const updated = await tx.interviewRound.update({
      where: { id },
      data: { ...data, meetingUrl: meetingUrl ?? null },
    });
    await renameScheduleBlock(
      tx,
      user,
      id,
      scheduleBlockTitle(before.application.company, before.title),
      scheduleBlockTitle(before.application.company, updated.title),
    );
    return updated;
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
    const updated = await tx.interviewRound.update({
      where: { id: round.id },
      data: { ...interval, timezone: input.timezone, status: 'SCHEDULED' },
    });
    await moveScheduleBlock(tx, user, round.id, interval);
    return updated;
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
    await settleScheduleBlock(tx, user, round.id, input.status, now);
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
