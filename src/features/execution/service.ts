import 'server-only';
import { z } from 'zod';
import {
  locked,
  ownedBlock,
  clearBlockReminders,
  type ScheduleUser,
} from '@/features/schedule/service';
import { interval, dateInput } from '@/features/schedule/domain';
import { localTime } from '@/lib/validation';
export async function execute(
  user: ScheduleUser,
  id: string,
  action: 'start' | 'stop' | 'complete' | 'skip' | 'cancel' | 'reset',
  reason = '',
  now = new Date(),
) {
  return locked(user.id, async (tx) => {
    const b = await ownedBlock(tx, user.id, id);
    const running = await tx.actualSession.findFirst({
      where: { userId: user.id, endedAt: null },
    });
    if (action === 'start') {
      if (running) {
        if (running.taskId === id) return;
        throw new Error(
          'Another session is running. Stop or complete it first.',
        );
      }
      if (!['PLANNED', 'IN_PROGRESS'].includes(b.status))
        throw new Error('Reset this block before starting it.');
      const recordedAhead = await tx.actualSession.findFirst({
        where: { userId: user.id, endedAt: { gt: now } },
      });
      if (recordedAhead)
        throw new Error(
          'Recorded actual time extends beyond now. Resolve that entry before starting a session.',
        );
      await tx.actualSession.create({
        data: {
          userId: user.id,
          taskId: id,
          goalId: b.goalId,
          category: b.category,
          startedAt: now,
        },
      });
      await tx.timeBlock.update({
        where: { id },
        data: { status: 'IN_PROGRESS', isOverride: true },
      });
    } else {
      const ownSession = running?.taskId === id ? running : null;
      if (action === 'complete' && b.status === 'COMPLETED' && !ownSession)
        return;
      if (['skip', 'cancel', 'reset'].includes(action) && ownSession)
        throw new Error('Stop the running session before changing its status.');
      if (action === 'stop' && !ownSession)
        throw new Error('No running session is linked to this block.');
      if (ownSession && ['stop', 'complete'].includes(action)) {
        if (now <= ownSession.startedAt)
          throw new Error('Wait a moment before stopping the session.');
        await tx.actualSession.update({
          where: { id: ownSession.id },
          data: { endedAt: now },
        });
      }
      const status =
        action === 'complete'
          ? 'COMPLETED'
          : action === 'skip'
            ? 'SKIPPED'
            : action === 'cancel'
              ? 'CANCELLED'
              : 'PLANNED';
      await tx.timeBlock.update({
        where: { id },
        data: {
          status,
          completedAt: status === 'COMPLETED' ? now : null,
          isOverride: true,
          skipReason:
            action === 'skip' ? z.string().max(300).parse(reason) : null,
        },
      });
    }
    await clearBlockReminders(tx, user.id, id);
  });
}
export const manualSessionInput = z.object({
  id: z.string().min(1),
  day: dateInput,
  endDay: dateInput,
  startLocal: localTime,
  endLocal: localTime,
  notes: z.string().max(1000).default(''),
});
export async function logSession(
  user: ScheduleUser,
  raw: unknown,
  now = new Date(),
) {
  const input = manualSessionInput.parse(raw);
  const range = interval(
    input.day,
    input.startLocal,
    input.endDay,
    input.endLocal,
    user.timezone,
  );
  if (range.plannedEnd > now)
    throw new Error('Actual time cannot end in the future.');
  return locked(user.id, async (tx) => {
    const b = await ownedBlock(tx, user.id, input.id);
    const overlap = await tx.actualSession.findFirst({
      where: {
        userId: user.id,
        startedAt: { lt: range.plannedEnd },
        OR: [{ endedAt: null }, { endedAt: { gt: range.plannedStart } }],
      },
    });
    if (overlap)
      throw new Error(
        'This overlaps an existing actual session. Choose the time you actually worked outside that interval.',
      );
    await tx.actualSession.create({
      data: {
        userId: user.id,
        taskId: b.id,
        goalId: b.goalId,
        category: b.category,
        startedAt: range.plannedStart,
        endedAt: range.plannedEnd,
        notes: input.notes,
      },
    });
    await tx.timeBlock.update({
      where: { id: b.id },
      data: { isOverride: true },
    });
    await clearBlockReminders(tx, user.id, b.id);
  });
}
export async function stopUnlinkedSession(
  user: ScheduleUser,
  id: string,
  now = new Date(),
) {
  return locked(user.id, async (tx) => {
    const session = await tx.actualSession.findFirst({
      where: { id, userId: user.id, endedAt: null, taskId: null },
    });
    if (!session)
      throw new Error('This unlinked session is no longer running.');
    if (now <= session.startedAt) throw new Error('End must be after start.');
    await tx.actualSession.update({ where: { id }, data: { endedAt: now } });
  });
}
