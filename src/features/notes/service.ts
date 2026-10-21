import 'server-only';
import { z } from 'zod';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/features/schedule/service';

export const noteInput = z.object({
  body: z.string().trim().min(1, 'Write something first.').max(500),
});

/** Open notes, oldest first, so Today reads like a short list to clear. */
export async function openNotes(userId: string) {
  return db().quickNote.findMany({
    where: { userId, doneAt: null },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
}
export async function addNote(user: ScheduleUser, raw: unknown) {
  const { body } = noteInput.parse(raw);
  return db().quickNote.create({ data: { userId: user.id, body } });
}
export async function noteOp(user: ScheduleUser, raw: unknown) {
  const { id, op } = z
    .object({ id: z.string().min(1), op: z.enum(['done', 'remove']) })
    .parse(raw);
  const note = await db().quickNote.findFirst({
    where: { id, userId: user.id },
  });
  if (!note) throw new Error('This note no longer exists.');
  if (op === 'remove') await db().quickNote.delete({ where: { id: note.id } });
  else
    await db().quickNote.update({
      where: { id: note.id },
      data: { doneAt: note.doneAt ?? new Date() },
    });
  return { op, note };
}
