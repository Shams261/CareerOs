'use server';
import { revalidatePath } from 'next/cache';
import { owner } from '@/server/db';
import { forgetAll } from '@/server/memo';
import type { ActionState } from '@/features/schedule/actions';
import { restoreCurriculum } from './service';

const count = (n: number, word: string) =>
  n ? `${n} ${word}${n === 1 ? '' : 's'}` : '';

/** Settings → Restore default curriculum (WI-064). */
export async function restoreCurriculumAction(): Promise<ActionState> {
  try {
    const r = await restoreCurriculum(await owner());
    forgetAll();
    for (const p of ['/roadmap', '/dsa', '/today', '/settings'])
      revalidatePath(p, 'layout');
    const parts = [
      count(r.roadmaps, 'roadmap'),
      count(r.items, 'item'),
      count(r.problems, 'problem'),
      count(r.unarchived, 'archived roadmap'),
      count(r.unhidden, 'hidden problem'),
    ].filter(Boolean);
    return {
      ok: true,
      message: parts.length
        ? `Restored ${parts.join(', ')}.`
        : 'Everything in the default curriculum is already here.',
    };
  } catch (error) {
    // Names and codes only, never record content (docs/engineering/security.md).
    console.error(
      '[curriculum] restore failed',
      error instanceof Error ? error.name : 'Error',
    );
    return {
      message:
        error instanceof Error && !('code' in error)
          ? error.message
          : 'Could not restore the curriculum. Try again.',
    };
  }
}
