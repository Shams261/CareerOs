import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { addNote, noteOp, openNotes } from '../src/features/notes/service';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('notes to self', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `notes-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `notes-${randomUUID()}`, timezone: 'America/Toronto' };
  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: { id: u.id, email: `${u.id}@example.com`, name: 'T' },
      });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });
  it('captures, lists oldest first, marks done and removes, owner only', async () => {
    await addNote(user, { body: '  Ask recruiter about the panel format ' });
    const second = await addNote(user, { body: 'Re-read consistent hashing' });
    await expect(addNote(user, { body: '   ' })).rejects.toThrow();
    let open = await openNotes(user.id);
    expect(open.map((n) => n.body)).toEqual([
      'Ask recruiter about the panel format',
      'Re-read consistent hashing',
    ]);
    await expect(noteOp(other, { id: second.id, op: 'done' })).rejects.toThrow(
      'no longer exists',
    );
    await noteOp(user, { id: open[0].id, op: 'done' });
    await noteOp(user, { id: second.id, op: 'remove' });
    open = await openNotes(user.id);
    expect(open).toHaveLength(0);
    expect(await prisma.quickNote.count({ where: { userId: user.id } })).toBe(
      1,
    );
  });
});
