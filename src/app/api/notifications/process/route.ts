import { processNotifications } from '@/features/notifications/service';
export const runtime = 'nodejs';
export async function POST() {
  try {
    return Response.json(await processNotifications());
  } catch (error) {
    console.error(
      'Notification processing failed',
      error instanceof Error ? error.name : 'Unknown error',
    );
    return Response.json(
      { error: 'Notification processing failed; retry safely.' },
      { status: 500 },
    );
  }
}
