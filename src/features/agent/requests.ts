import 'server-only';
/**
 * Rumi's bigger changes as one-press cards (WI-103, ADR-030 class B). `prepareRequest` reads
 * the target for the owner, refuses what cannot apply and builds the card's lines and the
 * snapshot it was made from; nothing changes. `applyRequest` loads the owner's answer, checks
 * the target again against the snapshot and applies it through the pages' own writers, all
 * in one owner lock, so a double press or a change in between applies nothing twice.
 * Covered by tests/agent-cards.test.ts and tests/rumi-security.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { dayKey, hhmm, localInstant, weekdayDate } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import {
  generateInTransaction,
  recordReview,
} from '@/features/schedule/service';
import { locked, type ScheduleUser } from '@/server/lock';
import { saveBlockIn } from '@/features/schedule/editing';
import { deleteBlockIn } from '@/features/deletes/service';
import { blockUndo } from '@/features/deletes/domain';
import {
  changeStageIn,
  createApplicationIn,
  scheduleRoundIn,
} from '@/features/jobs/service';
import {
  isOpen,
  label as stageLabel,
  quickAddInput,
  roundInput,
} from '@/features/jobs/domain';
import { typeLabel } from '@/features/jobs/formats';
import { applyItemOpIn, saveGoalIn } from '@/features/roadmap/service';
import { goalInput } from '@/features/roadmap/domain';
import { recordAttemptIn } from '@/features/dsa/service';
import { categoryGroup } from '@/lib/categories';
import { titleVisible } from './domain';
import { AGENT_NAME } from '@/features/agent/constants';
import { checkBlocks, planWindow } from './plan-domain';
import { takenOn } from './plans';
import { studyKinds } from './tools';
import {
  attemptFits,
  confidenceOf,
  readRequests,
  REQUEST_UNDO,
  requestArgs,
  reviewFields,
  solvedOf,
  type ActionCard,
  type RequestKind,
} from './request-domain';
import { REQUEST_WORDS } from '@/features/agent/text';

type Tx = Prisma.TransactionClient;
type Prepared = { result: unknown; card?: ActionCard };
const refused = (error: string): Prepared => ({
  result: { shown: false, error },
});
const span = (s: Date, e: Date, zone: string) =>
  `${hhmm(s, zone)}–${hhmm(e, zone)}`;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const when = (day: string, today: string) =>
  day === today ? 'Today' : weekdayDate(day);

/** The owner's block a card may name: visible (study or job search), not an interview's. */
async function cardBlock(
  client: Pick<Tx, 'timeBlock'>,
  user: ScheduleUser,
  id: string,
) {
  return client.timeBlock.findFirst({
    where: { id, dailyPlan: { userId: user.id } },
    include: {
      sessions: { select: { endedAt: true } },
      dailyPlan: { select: { date: true } },
    },
  });
}

/**
 * Builds one card for the owner, or says why not. The model is told a card was shown and
 * that nothing changes until the owner presses it.
 */
export async function prepareRequest(
  user: ScheduleUser,
  kind: RequestKind,
  raw: Record<string, unknown>,
  now: Date,
): Promise<Prepared> {
  const zone = user.timezone,
    today = dayKey(now, zone);
  const card = (
    summary: string[],
    snapshot: Record<string, string | null>,
    args = raw,
  ) => ({
    result: {
      shown: true,
      note: 'Shown to the owner as a card. Nothing changes until they press it.',
    },
    card: {
      id: randomUUID(),
      kind,
      args,
      summary,
      snapshot,
      status: 'shown' as const,
    },
  });
  if (kind === 'move_block' || kind === 'delete_block') {
    const a = raw as {
      blockId: string;
      day?: string;
      start?: string;
      end?: string;
    };
    const [b, study] = await Promise.all([
      cardBlock(db(), user, a.blockId),
      studyKinds(user.id),
    ]);
    if (!b || b.status === 'CANCELLED')
      return refused('That block is not on the plan.');
    if (!titleVisible(b.category, study) || isTestNamed(b.title))
      return refused(`${AGENT_NAME} changes only study and job blocks.`);
    if (b.interviewRoundId)
      return refused(
        'An interview block follows its round: change the round in Jobs.',
      );
    if (b.sessions.some((s) => !s.endedAt))
      return refused('A session is running on that block.');
    const from = `${when(dayOf(b.dailyPlan.date), today)} · ${span(b.plannedStart, b.plannedEnd, zone)}`;
    const head = `${b.title} · ${categoryGroup(b.category)}`;
    if (kind === 'delete_block')
      return card(
        [
          head,
          from,
          b.sessions.length
            ? 'Its recorded time goes with it; Undo brings both back.'
            : 'Undo brings it back.',
        ],
        { version: b.updatedAt.toISOString() },
      );
    // A block with recorded time keeps its slot; only a planned one moves (its time is history).
    if (b.status !== 'PLANNED' || b.sessions.length)
      return refused(
        'That block has recorded time or a decision; it keeps its slot.',
      );
    const window = planWindow(today);
    if (a.day! < window.first || a.day! > window.last)
      return refused(
        `${AGENT_NAME} moves blocks only to ${window.first} to ${window.last}.`,
      );
    const taken = (await takenOn(db(), user.id, a.day!, zone, study)).filter(
      (t) => !(+t.start === +b.plannedStart && +t.end === +b.plannedEnd),
    );
    const [checked] = checkBlocks(
      a.day!,
      [
        {
          title: b.title,
          kind: b.category,
          start: a.start!,
          end: a.end!,
          reason: 'Move',
        },
      ],
      taken,
      now,
      zone,
      [],
    );
    if (checked.conflict)
      return refused(
        `${checked.conflict}. No card was made; suggest another time.`,
      );
    return card(
      [head, `From ${from}`, `To ${when(a.day!, today)} · ${a.start}–${a.end}`],
      {
        version: b.updatedAt.toISOString(),
        fromDay: dayOf(b.dailyPlan.date),
        fromStart: hhmm(b.plannedStart, zone),
        fromEnd: hhmm(b.plannedEnd, zone),
      },
    );
  }
  if (kind === 'change_stage') {
    const a = raw as { applicationId: string; stage: string };
    const app = await db().jobApplication.findFirst({
      where: { id: a.applicationId, userId: user.id },
      select: { company: true, role: true, stage: true },
    });
    if (!app || isTestNamed(app.company, app.role))
      return refused('That application is not in Jobs.');
    if (app.stage === a.stage)
      return refused(`It is already at ${stageLabel(a.stage)}.`);
    return card(
      [
        `${app.company} · ${app.role}`,
        `From ${stageLabel(app.stage)} to ${stageLabel(a.stage)}`,
      ],
      // A fresh request id per press, so the change runs once yet a reopened card can run again.
      { stage: app.stage, requestId: randomUUID() },
    );
  }
  if (kind === 'log_attempt') {
    const a = raw as {
      problemId: string;
      confidence: 'shaky' | 'okay' | 'solid';
      solved: 'yes' | 'partial' | 'no';
      minutes?: number;
    };
    if (!attemptFits(a.confidence, a.solved))
      return refused(
        'Solved on their own needs okay or solid; with hints or the solution, shaky or okay. Ask the owner.',
      );
    const p = await db().dsaProblem.findFirst({
      where: { id: a.problemId, userId: user.id, hiddenAt: null },
      select: {
        title: true,
        difficulty: true,
        topic: { select: { name: true } },
      },
    });
    if (!p || isTestNamed(p.title))
      return refused('That problem is not in Practice.');
    const solved = {
      yes: 'Solved on my own',
      partial: 'With hints',
      no: 'Needed the solution',
    }[a.solved];
    return card(
      [
        `${p.title} · ${p.difficulty.toLowerCase()} · ${p.topic.name}`,
        [
          solved,
          a.confidence[0].toUpperCase() + a.confidence.slice(1),
          a.minutes ? `${a.minutes} min` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        'Attempts stay as recorded: there is no Undo.',
      ],
      { requestId: randomUUID() },
    );
  }
  // WI-118: a roadmap item started or done, an application, a round, a goal.
  if (kind === 'mark_item') {
    const a = raw as { itemId: string; mark: 'start' | 'done' };
    const item = await db().roadmapItem.findFirst({
      where: {
        id: a.itemId,
        userId: user.id,
        roadmap: { studyAi: true, archivedAt: null },
      },
      select: {
        title: true,
        section: true,
        status: true,
        dsaProblemId: true,
        updatedAt: true,
        roadmap: { select: { title: true } },
      },
    });
    if (!item || isTestNamed(item.title))
      return refused('That item is not on your roadmaps.');
    if (item.dsaProblemId)
      return refused(
        'That item follows Practice: a log_attempt card on its problem marks it.',
      );
    if (
      a.mark === 'done' ? item.status === 'DONE' : item.status !== 'NOT_STARTED'
    )
      return refused(
        item.status === 'DONE'
          ? 'It is already done.'
          : 'It is already started.',
      );
    return card(
      [
        `${item.title} · ${item.roadmap.title}`,
        item.section,
        a.mark === 'done'
          ? 'Mark done: its first revision comes in 7 days. Undo puts it back.'
          : 'Mark started. Undo puts it back.',
      ],
      { version: item.updatedAt.toISOString() },
    );
  }
  if (kind === 'add_application') {
    const a = raw as {
      company: string;
      role: string;
      stage?: 'SAVED' | 'APPLIED';
      appliedOn?: string;
    };
    if (a.appliedOn && a.appliedOn > today)
      return refused('An application is applied on a day that has come.');
    const same = await db().jobApplication.findFirst({
      where: {
        userId: user.id,
        company: { equals: a.company, mode: 'insensitive' },
        role: { equals: a.role, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (same)
      return refused(
        `${a.company} · ${a.role} is already in Jobs (application id ${same.id}).`,
      );
    return card(
      [
        `${a.company} · ${a.role}`,
        a.stage === 'SAVED'
          ? 'Saved, not applied yet'
          : `Applied ${a.appliedOn ? when(a.appliedOn, today) : 'today'}`,
      ],
      { requestId: randomUUID() },
    );
  }
  if (kind === 'add_round') {
    const a = raw as {
      applicationId: string;
      type: keyof typeof typeLabel;
      day: string;
      start: string;
      end?: string;
      title?: string;
    };
    const app = await db().jobApplication.findFirst({
      where: { id: a.applicationId, userId: user.id },
      select: { company: true, role: true, stage: true },
    });
    if (!app || isTestNamed(app.company, app.role))
      return refused('That application is not in Jobs.');
    if (!isOpen(app.stage))
      return refused(
        'That application is closed; the owner reopens it in Jobs.',
      );
    if (localInstant(a.day, a.start, zone) <= now)
      return refused(
        'That time has passed; ask the owner for the day and time.',
      );
    if (a.end && a.end <= a.start)
      return refused('The end comes before the start.');
    return card(
      [
        `${app.company} · ${app.role}`,
        a.title ? `${typeLabel[a.type]} · ${a.title}` : typeLabel[a.type],
        `${when(a.day, today)} · ${a.start}${a.end ? `–${a.end}` : ''}`,
      ],
      { stage: app.stage, requestId: randomUUID() },
    );
  }
  if (kind === 'set_goal') {
    const a = raw as {
      title: string;
      targetDate?: string;
      targetRole?: string;
    };
    if (a.targetDate && a.targetDate < today)
      return refused('That target date has passed.');
    return card(
      [
        a.title,
        a.targetDate ? `By ${when(a.targetDate, today)}` : 'No target date',
        ...(a.targetRole ? [`Role: ${a.targetRole}`] : []),
      ],
      { requestId: randomUUID() },
    );
  }
  // write_review: a draft the owner edits on the card before Save.
  const a = raw as { day: string };
  if (a.day > today) return refused('A day is reviewed once it has started.');
  const plan = await db().dailyPlan.findUnique({
    where: { userId_date: { userId: user.id, date: new Date(a.day) } },
    select: { checkIn: { select: { id: true } } },
  });
  if (plan?.checkIn)
    return refused(
      'That day already has a review; the owner edits it on Today.',
    );
  return card([when(a.day, today)], {});
}

/** Loads the owner's answer and its cards under the lock, with a save that keeps the rest. */
async function cardsOf(tx: Tx, user: ScheduleUser, messageId: string) {
  const message = await tx.agentMessage.findFirst({
    where: { id: messageId, userId: user.id, role: 'ASSISTANT' },
    select: { id: true, metadata: true },
  });
  if (!message) throw new Error('This answer no longer exists.');
  const base =
    message.metadata && typeof message.metadata === 'object'
      ? (message.metadata as Record<string, unknown>)
      : {};
  const cards = readRequests(base);
  const save = () =>
    tx.agentMessage.update({
      where: { id: message.id },
      data: { metadata: { ...base, requests: cards } as Prisma.InputJsonValue },
    });
  return { cards, save };
}

/**
 * The owner's press on a card: checked again against its snapshot and applied through the
 * pages' writers in one owner lock. Returns what to say and whether Undo is offered.
 */
export async function applyRequest(
  user: ScheduleUser,
  messageId: string,
  requestId: string,
  now = new Date(),
  review?: unknown,
) {
  return locked(user.id, async (tx) => {
    const { cards, save } = await cardsOf(tx, user, messageId);
    const c = cards.find((x) => x.id === requestId);
    if (!c) throw new Error('This card no longer exists.');
    if (c.status === 'applied')
      throw new Error('This card is already applied.');
    if (c.status === 'dismissed') throw new Error('This card was dismissed.');
    const undo = await applyIn(tx, user, c, now, review);
    c.status = 'applied';
    if (undo) c.undo = undo;
    else delete c.undo;
    await save();
    return { kind: c.kind, undo: !!undo };
  });
}

const changed = `Your records changed since ${AGENT_NAME} made this card. Nothing was changed; ask again.`;

async function applyIn(
  tx: Tx,
  user: ScheduleUser,
  c: ActionCard,
  now: Date,
  review: unknown,
): Promise<ActionCard['undo'] | null> {
  const zone = user.timezone,
    today = dayKey(now, zone);
  switch (c.kind) {
    case 'mark_item': {
      const a = requestArgs.mark_item.parse(c.args);
      const item = await tx.roadmapItem.findFirst({
        where: { id: a.itemId, userId: user.id },
        select: {
          id: true,
          status: true,
          completedAt: true,
          nextRevisionAt: true,
          revisionStage: true,
          updatedAt: true,
        },
      });
      if (!item || item.updatedAt.toISOString() !== c.snapshot.version)
        throw new Error(changed);
      await applyItemOpIn(tx, user, { id: item.id, op: a.mark }, now);
      return {
        kind: REQUEST_UNDO.mark_item!,
        payload: {
          id: item.id,
          status: item.status,
          completedAt: item.completedAt?.toISOString() ?? null,
          nextRevisionAt:
            item.nextRevisionAt?.toISOString().slice(0, 10) ?? null,
          revisionStage: item.revisionStage,
        },
      };
    }
    case 'add_application': {
      const a = requestArgs.add_application.parse(c.args);
      const same = await tx.jobApplication.findFirst({
        where: {
          userId: user.id,
          company: { equals: a.company, mode: 'insensitive' },
          role: { equals: a.role, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (same) throw new Error(changed);
      const app = await createApplicationIn(
        tx,
        user,
        quickAddInput.parse({
          requestId: c.snapshot.requestId ?? randomUUID(),
          company: a.company,
          role: a.role,
          stage: a.stage ?? 'APPLIED',
          appliedAt: a.appliedOn,
        }),
        now,
      );
      return { kind: REQUEST_UNDO.add_application!, payload: { id: app.id } };
    }
    case 'add_round': {
      const a = requestArgs.add_round.parse(c.args);
      const app = await tx.jobApplication.findFirst({
        where: { id: a.applicationId, userId: user.id },
        select: { id: true, stage: true },
      });
      if (!app || app.stage !== c.snapshot.stage) throw new Error(changed);
      if (localInstant(a.day, a.start, zone) <= now)
        throw new Error('That time has passed. Ask again for another time.');
      const round = await scheduleRoundIn(
        tx,
        user,
        roundInput.parse({
          requestId: c.snapshot.requestId ?? randomUUID(),
          applicationId: app.id,
          type: a.type,
          title: a.title,
          date: a.day,
          start: a.start,
          end: a.end,
          timezone: zone,
        }),
        now,
      );
      return { kind: REQUEST_UNDO.add_round!, payload: { id: round.id } };
    }
    case 'set_goal': {
      const a = requestArgs.set_goal.parse(c.args);
      if (a.targetDate && a.targetDate < today) throw new Error(changed);
      const goal = await saveGoalIn(
        tx,
        user,
        goalInput.parse({
          title: a.title,
          category: 'Career',
          targetDate: a.targetDate ?? '',
          targetRole: a.targetRole ?? '',
        }),
      );
      return { kind: REQUEST_UNDO.set_goal!, payload: { id: goal.id } };
    }
    case 'move_block': {
      const a = requestArgs.move_block.parse(c.args);
      const b = await cardBlock(tx, user, a.blockId);
      if (
        !b ||
        b.status === 'CANCELLED' ||
        b.updatedAt.toISOString() !== c.snapshot.version
      )
        throw new Error(changed);
      if (b.status !== 'PLANNED' || b.sessions.length || b.interviewRoundId)
        throw new Error(changed);
      if (localInstant(a.day, a.start, zone) <= now)
        throw new Error('That time has passed. Ask again for another time.');
      await generateInTransaction(tx, user, a.day);
      await saveBlockIn(
        tx,
        user,
        {
          id: b.id,
          title: b.title,
          category: b.category,
          description: b.description ?? '',
          goalId: b.goalId ?? '',
          priority: b.priority,
          day: a.day,
          endDay: a.day,
          startLocal: a.start,
          endLocal: a.end,
        },
        false,
        b.updatedAt.toISOString(),
      );
      const moved = await tx.timeBlock.findUniqueOrThrow({
        where: { id: b.id },
        select: { updatedAt: true },
      });
      return {
        kind: REQUEST_UNDO.move_block!,
        payload: {
          id: b.id,
          day: c.snapshot.fromDay,
          start: c.snapshot.fromStart,
          end: c.snapshot.fromEnd,
          version: moved.updatedAt.toISOString(),
        },
      };
    }
    case 'delete_block': {
      const a = requestArgs.delete_block.parse(c.args);
      const b = await cardBlock(tx, user, a.blockId);
      if (
        !b ||
        b.status === 'CANCELLED' ||
        b.updatedAt.toISOString() !== c.snapshot.version
      )
        throw new Error(changed);
      const gone = await deleteBlockIn(tx, user, b.id);
      return blockUndo(b.id, gone);
    }
    case 'change_stage': {
      const a = requestArgs.change_stage.parse(c.args);
      const app = await tx.jobApplication.findFirst({
        where: { id: a.applicationId, userId: user.id },
        select: { id: true, stage: true },
      });
      if (!app || app.stage !== c.snapshot.stage) throw new Error(changed);
      // The card's id is the request id, so the stage changes once however often it is sent.
      await changeStageIn(
        tx,
        user,
        { id: app.id, stage: a.stage, requestId: c.snapshot.requestId ?? c.id },
        now,
      );
      return {
        kind: REQUEST_UNDO.change_stage!,
        payload: { id: app.id, stage: app.stage },
      };
    }
    case 'log_attempt': {
      const a = requestArgs.log_attempt.parse(c.args);
      await recordAttemptIn(
        tx,
        user,
        {
          problemId: a.problemId,
          requestId: c.snapshot.requestId ?? c.id,
          confidenceAfter: confidenceOf(a.confidence),
          solvedIndependently: solvedOf(a.solved),
          durationMinutes: a.minutes,
          notes: '',
          mistake: '',
        },
        now,
      );
      return null;
    }
    case 'write_review': {
      const a = requestArgs.write_review.parse(c.args);
      if (a.day > today) throw new Error(changed);
      // The owner's own words from the card, never the draft unseen.
      const f = reviewFields.parse(review ?? {});
      const [plan, running] = await Promise.all([
        tx.dailyPlan.findUnique({
          where: { userId_date: { userId: user.id, date: new Date(a.day) } },
          select: { checkIn: { select: { id: true } } },
        }),
        tx.actualSession.findFirst({
          where: { userId: user.id, endedAt: null },
          select: { id: true },
        }),
      ]);
      if (plan?.checkIn) throw new Error(changed);
      if (running) throw new Error('Pause the running session first.');
      const saved = await recordReview(
        tx,
        user.id,
        a.day,
        {
          notes: f.notes,
          blocker: f.blocker,
          carryForward: f.carryForward,
          rating: f.rating === '' ? null : f.rating,
        },
        now,
      );
      const checkIn = await tx.dailyCheckIn.findUniqueOrThrow({
        where: { dailyPlanId: saved.id },
        select: { id: true },
      });
      return {
        kind: REQUEST_UNDO.write_review!,
        payload: { day: a.day, checkInId: checkIn.id },
      };
    }
  }
}

export async function dismissRequest(
  user: ScheduleUser,
  messageId: string,
  requestId: string,
) {
  return locked(user.id, async (tx) => {
    const { cards, save } = await cardsOf(tx, user, messageId);
    const c = cards.find((x) => x.id === requestId);
    if (!c || c.status !== 'shown') throw new Error('This card is not open.');
    c.status = 'dismissed';
    await save();
  });
}

/**
 * Undo on an applied card: its stored undo runs (never one from the page), then the card is
 * open again, as a plan card is after its Undo.
 */
export async function undoRequest(
  user: ScheduleUser,
  messageId: string,
  requestId: string,
  run: (kind: string, payload: unknown) => Promise<string>,
) {
  const message = await db().agentMessage.findFirst({
    where: { id: messageId, userId: user.id, role: 'ASSISTANT' },
    select: { metadata: true },
  });
  const c = message
    ? readRequests(message.metadata).find((x) => x.id === requestId)
    : null;
  if (!c || c.status !== 'applied' || !c.undo)
    throw new Error('Nothing to undo on this card.');
  const words = await run(c.undo.kind, c.undo.payload);
  await locked(user.id, async (tx) => {
    const { cards, save } = await cardsOf(tx, user, messageId);
    const again = cards.find((x) => x.id === requestId);
    if (!again || again.status !== 'applied') return;
    again.status = 'shown';
    delete again.undo;
    // The reopened card applies against the records as they are after the Undo.
    if (again.kind === 'move_block' || again.kind === 'delete_block') {
      const b = await tx.timeBlock.findFirst({
        where: {
          id: String((again.args as { blockId: string }).blockId),
          dailyPlan: { userId: user.id },
        },
        select: { updatedAt: true },
      });
      if (b) again.snapshot.version = b.updatedAt.toISOString();
    }
    if (again.kind === 'change_stage') again.snapshot.requestId = randomUUID();
    // WI-118: a reopened card runs again as a new request, against the item as it is now.
    if (
      again.kind === 'add_application' ||
      again.kind === 'add_round' ||
      again.kind === 'set_goal'
    )
      again.snapshot.requestId = randomUUID();
    if (again.kind === 'mark_item') {
      const item = await tx.roadmapItem.findFirst({
        where: {
          id: String((again.args as { itemId: string }).itemId),
          userId: user.id,
        },
        select: { updatedAt: true },
      });
      if (item) again.snapshot.version = item.updatedAt.toISOString();
    }
    await save();
  });
  return words;
}

/** The words after a press. */
export const appliedWords = (kind: RequestKind) => REQUEST_WORDS[kind].done;
