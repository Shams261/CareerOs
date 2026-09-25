'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { owner } from '@/server/db';
import { removeSubscription, saveSubscription, sendTest } from './service';

type Result = { ok: boolean; message: string };
async function run(work: () => Promise<string>): Promise<Result> {
  try {
    const message = await work();
    revalidatePath('/settings');
    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof z.ZodError
          ? 'This browser returned an unsupported subscription.'
          : error instanceof Error && !('code' in error)
            ? error.message
            : 'Unable to update notifications. Try again.',
    };
  }
}
export async function subscribeAction(subscription: unknown): Promise<Result> {
  return run(async () => {
    await saveSubscription(await owner(), subscription);
    return 'Notifications enabled on this device.';
  });
}
export async function unsubscribeAction(endpoint: string): Promise<Result> {
  return run(async () => {
    await removeSubscription(await owner(), z.string().min(1).parse(endpoint));
    return 'This device will no longer receive notifications.';
  });
}
export async function testPushAction(endpoint: string): Promise<Result> {
  return run(async () => {
    await sendTest(await owner(), z.string().min(1).parse(endpoint));
    return 'Test notification sent. It should appear within a few seconds.';
  });
}
