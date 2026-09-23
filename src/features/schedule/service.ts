import 'server-only';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { routineOccurrence, dateInput } from './domain';
export type ScheduleUser = { id: string; timezone: string };
export async function locked<T>(
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      return work(tx);
    },
    { timeout: 20000 },
  );
}
export async function generateInTransaction(
  tx: Prisma.TransactionClient,
  user: ScheduleUser,
  day: string,
) {
  dateInput.parse(day);
  const plan = await tx.dailyPlan.upsert({
    where: { userId_date: { userId: user.id, date: new Date(day) } },
    create: { userId: user.id, date: new Date(day) },
    update: {},
  });
  if (plan.generatedAt) return plan;
  const routines = await tx.routineBlock.findMany({
    where: { userId: user.id, enabled: true },
  });
  for (const r of routines) {
    const occurrence = routineOccurrence(r, day, user.timezone);
    if (!occurrence) continue;
    await tx.timeBlock.upsert({
      where: {
        routineKey_occurrenceDate: {
          routineKey: r.id,
          occurrenceDate: new Date(day),
        },
      },
      create: {
        dailyPlanId: plan.id,
        routineKey: r.id,
        occurrenceDate: new Date(day),
        title: r.title,
        category: r.category,
        description: r.description,
        priority: r.priority,
        goalId: r.goalId,
        ...occurrence,
      },
      update: {},
    });
  }
  return tx.dailyPlan.update({
    where: { id: plan.id },
    data: { generatedAt: new Date() },
  });
}
export async function generatePlan(user: ScheduleUser, day: string) {
  return locked(user.id, (tx) => generateInTransaction(tx, user, day));
}
export async function validateGoal(
  tx: Prisma.TransactionClient,
  userId: string,
  goalId?: string,
) {
  if (goalId && !(await tx.goal.findFirst({ where: { id: goalId, userId } })))
    throw new Error('Choose a goal from your workspace.');
}
export async function ownedBlock(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  const block = await tx.timeBlock.findFirst({
    where: { id, dailyPlan: { userId } },
    include: { sessions: true, dailyPlan: true },
  });
  if (!block) throw new Error('This block no longer exists. Reload the page.');
  return block;
}
export async function clearBlockReminders(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  await tx.notificationLog.updateMany({
    where: {
      userId,
      readAt: null,
      type: { in: ['UPCOMING_BLOCK', 'OVERDUE_TASK'] },
      dedupeKey: { contains: `:${id}:` },
    },
    data: { readAt: new Date() },
  });
}
