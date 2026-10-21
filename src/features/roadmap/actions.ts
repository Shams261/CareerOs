'use server';
import { forgetAll } from '@/server/memo';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { issueMessages } from '@/lib/validation';
import { owner } from '@/server/db';
import type { ActionState } from '@/features/schedule/actions';
import {
  addItems,
  applyItemOp,
  saveGoal,
  saveItem,
  saveItemNotes,
  saveRoadmap,
} from './service';

type Done = string | { message: string; undo?: ActionState['undo'] };
async function perform(work: () => Promise<Done>): Promise<ActionState> {
  try {
    const done = await work();
    forgetAll();
    revalidatePath('/roadmap', 'layout');
    revalidatePath('/today');
    revalidatePath('/review');
    return typeof done === 'string'
      ? { ok: true, message: done }
      : { ok: true, message: done.message, undo: done.undo };
  } catch (error) {
    return {
      message:
        error instanceof z.ZodError
          ? issueMessages(error.issues)
          : error instanceof Error && !('code' in error)
            ? error.message
            : 'Unable to save. Reload and try again.',
    };
  }
}
export async function goalAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await saveGoal(await owner(), Object.fromEntries(f));
    return f.get('id') ? 'Goal saved.' : 'Goal added.';
  });
}
export async function roadmapAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await saveRoadmap(await owner(), {
      ...Object.fromEntries(f),
      archived: f.get('archived') === 'on',
    });
    return f.get('id') ? 'Roadmap saved.' : 'Roadmap added.';
  });
}
export async function bulkItemsAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const n = await addItems(await owner(), Object.fromEntries(f));
    return `${n} item${n === 1 ? '' : 's'} added.`;
  });
}
export async function itemAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await saveItem(await owner(), Object.fromEntries(f));
    return 'Item saved.';
  });
}
export async function noteAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    await saveItemNotes(await owner(), {
      id: f.get('id'),
      notes: f.get('notes') ?? '',
    });
    return 'Note saved.';
  });
}
export async function itemOpAction(_s: ActionState, f: FormData) {
  return perform(async () => {
    const { op, item } = await applyItemOp(await owner(), {
      id: f.get('id'),
      op: f.get('op'),
    });
    if (op === 'remove')
      return {
        message: 'Removed.',
        undo: {
          kind: 'restore-roadmap-item',
          payload: {
            roadmapId: item.roadmapId,
            section: item.section,
            kind: item.kind,
            title: item.title,
            notes: item.notes,
            url: item.url,
            slug: item.slug,
            scope: item.scope,
            checkpoint: item.checkpoint,
            priority: item.priority,
            estimateMinutes: item.estimateMinutes,
            references: item.references,
            sourceRef: item.sourceRef,
            nextRevisionAt:
              item.nextRevisionAt?.toISOString().slice(0, 10) ?? null,
            revisionStage: item.revisionStage,
            status: item.status,
            askedInInterview: item.askedInInterview,
            askedNote: item.askedNote,
            ordering: item.ordering,
            learningTopicId: item.learningTopicId,
            dsaProblemId: item.dsaProblemId,
            dsaTopicId: item.dsaTopicId,
          },
        },
      };
    return op === 'asked'
      ? 'Marked as asked in an interview.'
      : op === 'revised'
        ? 'Revision recorded; the next one is scheduled.'
        : op === 'done'
          ? 'Done. Revision in 7 days.'
          : 'Saved.';
  });
}
