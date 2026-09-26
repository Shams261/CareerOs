import { owner } from '@/server/db';
import { exportOwnerData } from '@/server/export';
export const runtime = 'nodejs';

/** Authenticated JSON download of the owner's Silsila data (see server/export.ts exclusions). */
export async function GET() {
  const user = await owner();
  const data = await exportOwnerData(user.id);
  const day = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="careeros-export-${day}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
