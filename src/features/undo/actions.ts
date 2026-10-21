'use server';
import { revalidatePath } from 'next/cache';
import { forgetAll } from '@/server/memo';
import { owner } from '@/server/db';
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
      message:
        error instanceof Error && !('code' in error)
          ? error.message
          : 'Unable to undo. Reload and try again.',
    };
  }
}
