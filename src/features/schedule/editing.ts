import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import {
  blockInput,
  routineInput,
  routineOccurrence,
  type RoutineInput,
  interval,
  routineOverlaps,
} from './domain';
import {
  locked,
  validateGoal,
  ownedBlock,
  clearBlockReminders,
  type ScheduleUser,
} from './service';
import { dayKey } from '@/lib/time';
export class PreviewRequired extends Error {
  constructor(
    public token: string,
    public lines: string[],
  ) {
    super('Review the changes below, then confirm.');
  }
}
const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function conflicts(
  tx: Prisma.TransactionClient,
  userId: string,
  start: Date,
  end: Date,
  exclude?: string,
) {
  return tx.timeBlock.findMany({
    where: {
      id: exclude ? { not: exclude } : undefined,
      dailyPlan: { userId },
      status: { not: 'CANCELLED' },
      plannedStart: { lt: end },
      plannedEnd: { gt: start },
    },
    orderBy: { plannedStart: 'asc' },
  });
}
export async function saveBlock(
  user: ScheduleUser,
  raw: unknown,
  allowOverlap: boolean,
  version?: string,
) {
  const input = blockInput.parse(raw),
    range = interval(
      input.day,
      input.startLocal,
      input.endDay,
      input.endLocal,
      user.timezone,
    );
  return locked(user.id, async (tx) => {
    await validateGoal(tx, user.id, input.goalId);
    const existing = input.id ? await ownedBlock(tx, user.id, input.id) : null;
    if (existing) {
      if (existing.updatedAt.toISOString() !== version)
        throw new Error(
          'This block changed in another tab. Reload before editing.',
        );
      if (existing.sessions.some((s) => !s.endedAt))
        throw new Error('Stop the running session before editing its plan.');
    }
    const collisions = await conflicts(
      tx,
      user.id,
      range.plannedStart,
      range.plannedEnd,
      existing?.id,
    );
    if (collisions.length && !allowOverlap)
      throw new Error(
        `Overlap: ${collisions.map((b) => `${b.title} (${formatInTimeZone(b.plannedStart, user.timezone, 'MMM d, h:mm a')}–${formatInTimeZone(b.plannedEnd, user.timezone, 'h:mm a')})`).join('; ')}. Check “Allow this overlap” to proceed intentionally.`,
      );
    const plan = await tx.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(input.day) } },
      create: { userId: user.id, date: new Date(input.day) },
      update: {},
    });
    const data = {
      dailyPlanId: plan.id,
      title: input.title,
      description: input.description,
      category: input.category,
      goalId: input.goalId || null,
      priority: input.priority,
      ...range,
      isOverride: true,
    };
    if (existing) {
      await tx.timeBlock.update({ where: { id: existing.id }, data });
      await clearBlockReminders(tx, user.id, existing.id);
    } else await tx.timeBlock.create({ data });
  });
}
type Proposal = {
  id?: string;
  planId: string;
  day: string;
  kind: 'create' | 'update' | 'cancel';
  title: string;
  start?: Date;
  end?: Date;
  version?: string;
};
async function proposals(
  tx: Prisma.TransactionClient,
  user: ScheduleUser,
  input: RoutineInput,
  now: Date,
) {
  if (!input.id) return [];
  const plans = await tx.dailyPlan.findMany({
    where: {
      userId: user.id,
      generatedAt: { not: null },
      date: { gte: new Date(dayKey(now, user.timezone)) },
    },
    orderBy: { date: 'asc' },
  });
  const result: Proposal[] = [];
  for (const plan of plans) {
    const day = plan.date.toISOString().slice(0, 10);
    const prior = await tx.timeBlock.findUnique({
      where: {
        routineKey_occurrenceDate: {
          routineKey: input.id,
          occurrenceDate: plan.date,
        },
      },
      include: { sessions: true },
    });
    if (
      prior &&
      (prior.isOverride ||
        prior.sessions.length ||
        !['PLANNED', 'CANCELLED'].includes(prior.status) ||
        prior.plannedStart <= now)
    )
      continue;
    const occurrence = routineOccurrence(input, day, user.timezone);
    if (occurrence && occurrence.plannedStart > now)
      result.push({
        id: prior?.id,
        planId: plan.id,
        day,
        kind: prior ? 'update' : 'create',
        title: input.title,
        start: occurrence.plannedStart,
        end: occurrence.plannedEnd,
        version: prior?.updatedAt.toISOString(),
      });
    else if (prior && prior.status === 'PLANNED')
      result.push({
        id: prior.id,
        planId: plan.id,
        day,
        kind: 'cancel',
        title: prior.title,
        version: prior.updatedAt.toISOString(),
      });
  }
  return result;
}
export async function saveRoutine(
  user: ScheduleUser,
  raw: unknown,
  options: {
    sync: boolean;
    token?: string;
    version?: string;
    remove?: boolean;
    allowOverlap?: boolean;
  },
  now = new Date(),
) {
  const input = routineInput.parse(raw);
  return locked(user.id, async (tx) => {
    await validateGoal(tx, user.id, input.goalId);
    const previous = input.id
      ? await tx.routineBlock.findFirst({
          where: { id: input.id, userId: user.id },
        })
      : null;
    if (input.id && !previous)
      throw new Error('Routine no longer exists. Reload the page.');
    if (previous && previous.updatedAt.toISOString() !== options.version)
      throw new Error('Routine changed in another tab. Reload before editing.');
    const candidate = {
      ...input,
      id: previous?.id,
      enabled: options.remove ? false : input.enabled,
    };
    if (candidate.enabled && !options.allowOverlap) {
      const others = await tx.routineBlock.findMany({
        where: {
          userId: user.id,
          enabled: true,
          id: previous ? { not: previous.id } : undefined,
        },
      });
      const collisions = others.filter((r) => routineOverlaps(candidate, r));
      if (collisions.length)
        throw new Error(
          `Recurring overlap: ${collisions.map((r) => `${r.title} (${r.startLocal}–${r.endLocal})`).join(', ')}. Check “Allow this overlap” to save intentionally.`,
        );
    }
    const changes = options.sync
      ? await proposals(tx, user, candidate, now)
      : [];
    const lines = changes.map(
      (p) =>
        `${p.day}: ${p.kind} ${p.title}${p.start ? ` → ${formatInTimeZone(p.start, user.timezone, 'h:mm a')}–${formatInTimeZone(p.end!, user.timezone, 'h:mm a')}` : ''}`,
    );
    const token = fingerprint({
      input: candidate,
      changes,
      remove: options.remove,
      version: options.version,
    });
    if ((options.sync || options.remove) && options.token !== token)
      throw new PreviewRequired(
        token,
        lines.length
          ? lines
          : [
              'No eligible dated blocks will change. Existing daily overrides and recorded work are preserved.',
            ],
      );
    if (!options.allowOverlap)
      for (const change of changes) {
        if (change.start && change.end) {
          const overlap = await conflicts(
            tx,
            user.id,
            change.start,
            change.end,
            change.id,
          );
          if (overlap.length)
            throw new Error(
              `${change.day}: overlaps ${overlap.map((b) => b.title).join(', ')}. Check “Allow this overlap” and preview again.`,
            );
        }
      }
    const { id: ignored, ...fields } = input;
    void ignored;
    if (options.remove) {
      if (!previous) throw new Error('Select an existing routine.');
      await tx.routineBlock.delete({ where: { id: previous.id } });
    } else if (previous)
      await tx.routineBlock.update({
        where: { id: previous.id },
        data: { ...fields, goalId: fields.goalId || null },
      });
    else
      await tx.routineBlock.create({
        data: {
          ...fields,
          id: randomUUID(),
          userId: user.id,
          goalId: fields.goalId || null,
        },
      });
    for (const p of changes) {
      if (p.kind === 'cancel') {
        await tx.timeBlock.update({
          where: { id: p.id },
          data: { status: 'CANCELLED' },
        });
      } else {
        const data = {
          title: input.title,
          description: input.description,
          priority: input.priority,
          category: input.category,
          goalId: input.goalId || null,
          plannedStart: p.start!,
          plannedEnd: p.end!,
          status: 'PLANNED' as const,
        };
        if (p.id) await tx.timeBlock.update({ where: { id: p.id }, data });
        else
          await tx.timeBlock.create({
            data: {
              ...data,
              dailyPlanId: p.planId,
              routineKey: input.id,
              occurrenceDate: new Date(p.day),
            },
          });
      }
      if (p.id) await clearBlockReminders(tx, user.id, p.id);
    }
    return changes.length;
  });
}
export async function routineOptions(userId: string) {
  return db().goal.findMany({
    where: { userId },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });
}
