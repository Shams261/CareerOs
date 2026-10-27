'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import type { ActionState } from '@/features/schedule/actions';
import { AiRefusal, AiUnavailable } from '@/features/ai/service';
import { docInput } from './domain';
import { deletePrepDoc, UNAVAILABLE, writePrepDoc } from './service';

export type PrepResult =
  { ok: true; href: string } | { ok: false; message: string };

/** Prepare with Rumi (WI-042): research, write, store, and open the doc. */
export async function prepAction(
  applicationId: string,
  jobDescription: boolean,
): Promise<PrepResult> {
  const user = await owner();
  try {
    const input = docInput.parse({ applicationId, jobDescription });
    const doc = await writePrepDoc(user, input);
    forgetAll();
    revalidatePath(`/jobs/${doc.applicationId}`);
    return { ok: true, href: `/jobs/${doc.applicationId}/prep/${doc.id}` };
  } catch (error) {
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message };
    console.error(
      '[prep] doc failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false, message: UNAVAILABLE };
  }
}

export async function deletePrepDocAction(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let applicationId: string;
  try {
    applicationId = await deletePrepDoc(
      await owner(),
      z.string().min(1).parse(f.get('id')),
    );
  } catch (error) {
    return {
      message:
        error instanceof Error && !('code' in error)
          ? error.message
          : 'Unable to delete. Reload and try again.',
    };
  }
  revalidatePath('/jobs', 'layout');
  redirect(`/jobs/${applicationId}`);
}
