'use server';
import { failure } from '@/server/action';
import { revalidatePath } from 'next/cache';
import { forgetAll } from '@/server/memo';
import { owner } from '@/server/db';
import { z } from 'zod';
import { syncSoon } from '@/features/calendar/background';
import { undoWrite } from '@/features/agent/writes';
import { restore } from './service';

/** Called from the Undo button beside a success message. */
export async function undoAction(kind: string, payload: unknown) {
  try {
    const message = await restore(await owner(), kind, payload);
    forgetAll();
    revalidatePath('/', 'layout');
    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      message: failure(error, 'undo', 'Unable to undo. Reload and try again.'),
    };
  }
}

/**
 * Undo on one of Rumi's changes (WI-102): the stored undo of the owner's own answer. It lives
 * with the other undo since WI-139, so Rumi's code never reaches into the undo feature.
 */
export async function undoWriteAction(
  messageId: string,
  actionId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await owner();
    const message = await undoWrite(
      user,
      z.string().min(1).max(40).parse(messageId),
      z.string().min(1).max(60).parse(actionId),
      (kind, payload) => restore(user, kind, payload),
    );
    forgetAll();
    for (const path of ['/rumi', '/today', '/calendar']) revalidatePath(path);
    syncSoon(user);
    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      message: failure(error, 'agent', 'Unable to undo. Reload and try again.'),
    };
  }
}
