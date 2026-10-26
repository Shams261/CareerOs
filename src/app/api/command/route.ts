import { z } from 'zod';
import { owner } from '@/server/db';
import { searchCommands, todayCommands } from '@/features/command/service';
export const runtime = 'nodejs';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** The command bar's reads (WI-036), behind the session: today's commands. Never cached. */
export async function GET() {
  const user = await owner();
  return Response.json({ commands: await todayCommands(user) }, noStore);
}

/**
 * The search, as a POST so the typed words (which may become a note) never sit in a URL or
 * a log line: the owner's roadmap items, problems and applications that match.
 */
export async function POST(request: Request) {
  const user = await owner();
  const parsed = z
    .object({ q: z.string().max(500) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ commands: [] }, noStore);
  return Response.json(
    { commands: await searchCommands(user, parsed.data.q.slice(0, 100)) },
    noStore,
  );
}
