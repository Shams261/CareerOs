import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import { askRumi, noteMemories } from '@/features/agent/service';
import { afterWrites } from '@/features/agent/after-writes';
import { voiceInput } from '@/features/agent/voice-domain';
export const runtime = 'nodejs';

/**
 * Ask Rumi with live progress (WI-055): newline-delimited JSON, one `{"read":"get_today"}`
 * line as each read starts, then `{"done":…}` with the same result as the server action. Only
 * tool names travel early; the answer is checked and stored before it is sent. The question
 * is in the body, never a URL, and a request from another site is refused.
 */
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host)
    return new Response(null, { status: 403 });
  const user = await owner();
  const parsed = z
    .object({
      conversationId: z.string().min(1).max(40).nullable(),
      text: z.string().max(4000),
      // WI-104: only that it came by voice and whether it was edited; never audio.
      voice: voiceInput.nullable().optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const line = (value: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      const result = await askRumi(
        user,
        parsed.data.conversationId,
        parsed.data.text,
        (read) => line({ read }),
        fetch,
        (write) => line({ write }),
        parsed.data.voice ?? null,
      );
      if (result.ok) {
        revalidatePath('/rumi');
        afterWrites(user, result.reply.actions);
      }
      line({ done: result });
      // The notes Rumi keeps after the answer (WI-100) follow it, never delaying it.
      if (result.ok) {
        const items = await noteMemories(user, result);
        if (items.length) {
          revalidatePath('/rumi');
          line({ kept: { messageId: result.reply.id, items } });
        }
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
