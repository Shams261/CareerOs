import { formatDistance } from 'date-fns';
import { Disclosure } from '@/components/disclosure';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import type { ScheduleUser } from '@/features/schedule/service';
import { calendarConfig } from '@/lib/env';
import { db } from '@/server/db';
import {
  categoriesAction,
  connectCalendarAction,
  disconnectAction,
  resolveConflictAction,
  syncNowAction,
} from './actions';
import {
  calendarOverview,
  errorMessages,
  type CalendarErrorCode,
} from './service';
import {
  blockSyncView,
  categoryKey,
  snapshotLabel,
  SYNC_WINDOW,
  type Snapshot,
} from './domain';

const statusText = {
  DISCONNECTED: 'Disconnected',
  CONNECTED: 'Connected',
  REAUTH_REQUIRED: 'Reconnect required',
  ERROR: 'Needs attention',
} as const;

/** Google Calendar connection, health, conflicts and controls for /calendar. */
export async function GoogleCalendarPanel({
  user,
  flash,
}: {
  user: ScheduleUser;
  flash?: { google?: string; reason?: string };
}) {
  let configured = true;
  try {
    configured = !!calendarConfig();
  } catch {
    configured = false;
  }
  const { conn, conflicts } = await calendarOverview(user);
  const now = new Date();
  const notice =
    flash?.google === 'connected'
      ? 'Google Calendar connected. The first sync is running in the background.'
      : flash?.google === 'disconnected'
        ? 'Disconnected. Existing events stay in the Silsila Google calendar; your Silsila schedule is unchanged.'
        : flash?.google === 'removed'
          ? 'Disconnected and removed the Silsila Google calendar. Your Silsila schedule is unchanged.'
          : flash?.google === 'resolved_local'
            ? 'Kept the Silsila version and updated Google Calendar.'
            : flash?.google === 'resolved_remote'
              ? 'Applied the Google Calendar version to that day.'
              : flash?.google === 'error'
                ? (errorMessages[flash.reason as CalendarErrorCode] ??
                  errorMessages.exchange_failed)
                : null;
  if (!configured)
    return (
      <section className="card" aria-labelledby="google-heading">
        <h2 id="google-heading">Google Calendar</h2>
        <p className="muted">Not configured on this server.</p>
      </section>
    );
  const connected = conn && conn.status !== 'DISCONNECTED';
  const blocks = connected
    ? await db().timeBlock.findMany({
        where: {
          dailyPlan: { userId: user.id },
          plannedEnd: { gte: new Date(+now - SYNC_WINDOW.pastDays * 86400000) },
          plannedStart: {
            lte: new Date(+now + SYNC_WINDOW.futureDays * 86400000),
          },
        },
      })
    : [];
  const views = blocks.map((b) =>
    blockSyncView(b, conn?.calendarId ?? null, conn?.excludedCategories ?? []),
  );
  const count = (v: string) => views.filter((x) => x === v).length;
  const pending = count('Pending'),
    errors = count('Error');
  const health = !connected
    ? null
    : conn.status === 'REAUTH_REQUIRED' || conn.status === 'ERROR'
      ? 'Error'
      : conflicts.length
        ? 'Conflict'
        : conn.lastSyncError || errors
          ? 'Error'
          : pending
            ? 'Pending changes'
            : 'Healthy';
  const categories = [
    ...new Set(
      (
        await db().timeBlock.findMany({
          where: { dailyPlan: { userId: user.id } },
          select: { category: true },
          distinct: ['category'],
        })
      ).map((b) => categoryKey(b.category)),
    ),
  ].sort();
  const excluded = (conn?.excludedCategories ?? []).map(categoryKey);
  return (
    <section className="card" aria-labelledby="google-heading">
      <h2 id="google-heading">Google Calendar</h2>
      {notice && (
        <p
          role="status"
          className={
            flash?.google === 'error' ? 'form-message' : 'form-success'
          }
        >
          {notice}
        </p>
      )}
      {!connected ? (
        <>
          <p className="muted">
            Shows your planned blocks in a separate{' '}
            <strong>{conn?.calendarName ?? 'Silsila'}</strong> calendar in your
            Google account. Only that calendar is ever touched.
          </p>
          <form action={connectCalendarAction}>
            <Button>Connect Google Calendar</Button>
          </form>
        </>
      ) : (
        <>
          <dl className="job-facts">
            {[
              ['Status', statusText[conn.status]],
              ['Account', conn.accountEmail ?? 'Unknown'],
              ['Calendar', conn.calendarName ?? 'Missing'],
              [
                'Last sync',
                conn.lastSuccessfulSyncAt
                  ? formatDistance(conn.lastSuccessfulSyncAt, now, {
                      addSuffix: true,
                    })
                  : 'Not yet',
              ],
              ['Sync status', health],
              ['Pending changes', String(pending)],
              [
                'Updates',
                calendarConfig()?.webhookBaseUrl
                  ? 'Instant, with a scheduled fallback'
                  : 'Scheduled',
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {conn.lastSyncError && (
            <p role="alert" className="form-message">
              Sync failed:{' '}
              {errorMessages[conn.lastSyncError as CalendarErrorCode] ??
                errorMessages.unexpected}
            </p>
          )}
          <div className="actions">
            {conn.status === 'CONNECTED' && (
              <ActionForm action={syncNowAction}>
                <Button>Sync now</Button>
              </ActionForm>
            )}
            {conn.status !== 'CONNECTED' && (
              <form action={connectCalendarAction}>
                <Button>Reconnect Google Calendar</Button>
              </form>
            )}
          </div>
          {conflicts.length > 0 && (
            <div className="mt-4" aria-label="Sync conflicts">
              <h3>Sync conflicts · {conflicts.length}</h3>
              <p className="muted">
                Both sides changed these blocks. Choose which version to keep.
              </p>
              {conflicts.map((c) => (
                <article className="learning-history" key={c.id}>
                  <h4>{c.timeBlock.title}</h4>
                  <p>
                    <strong>Silsila:</strong>{' '}
                    {snapshotLabel(c.localSnapshot as Snapshot, user.timezone)}
                  </p>
                  <p>
                    <strong>Google:</strong>{' '}
                    {snapshotLabel(c.remoteSnapshot as Snapshot, user.timezone)}
                  </p>
                  <div className="actions">
                    {(['local', 'remote'] as const).map((choice) => (
                      <ActionForm
                        key={choice}
                        action={resolveConflictAction}
                        label={`${choice === 'local' ? 'Keep Silsila' : 'Use Google Calendar'} for ${c.timeBlock.title}`}
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="choice" value={choice} />
                        <Button
                          className={choice === 'remote' ? 'secondary' : ''}
                        >
                          {choice === 'local'
                            ? 'Keep Silsila'
                            : 'Use Google Calendar'}
                        </Button>
                      </ActionForm>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
          <Disclosure
            variant="link"
            label="Categories to sync"
            className="mt-4"
          >
            <ActionForm
              action={categoriesAction}
              label="Sync categories"
              className="dsa-form"
            >
              {categories.map((c) => (
                <label className="check" key={c}>
                  <input type="hidden" name="category" value={c} />
                  <input
                    type="checkbox"
                    name="sync"
                    value={c}
                    defaultChecked={!excluded.includes(c)}
                  />
                  {c.replaceAll('_', ' ')}
                </label>
              ))}
              <p className="muted">
                Blocks from the last {SYNC_WINDOW.pastDays} and next{' '}
                {SYNC_WINDOW.futureDays} days sync.
              </p>
              <Button>Save categories</Button>
            </ActionForm>
          </Disclosure>
          <Disclosure variant="link" label="Disconnect" className="mt-3">
            <ActionForm
              action={disconnectAction}
              label="Disconnect Google Calendar"
              className="dsa-form"
            >
              <p className="muted">
                Stops sync. Your Silsila schedule is unchanged.
              </p>
              <label className="check">
                <input type="checkbox" name="remove" />
                Also delete the “{conn.calendarName ?? 'Silsila'}” Google
                calendar (only that calendar; never your other calendars)
              </label>
              <label>
                To delete it, type the calendar name
                <input name="confirm" autoComplete="off" />
              </label>
              <Button className="secondary">Disconnect Google Calendar</Button>
            </ActionForm>
          </Disclosure>
        </>
      )}
    </section>
  );
}

/** Small Today notice, shown only when calendar sync needs the owner. */
export async function CalendarAttention({ user }: { user: ScheduleUser }) {
  const { conn, conflicts } = await calendarOverview(user);
  if (!conn || conn.status === 'DISCONNECTED') return null;
  const needs = conn.status !== 'CONNECTED' || conflicts.length > 0;
  if (!needs) return null;
  return (
    <p role="status" className="form-message mb-5">
      Google Calendar needs attention
      {conflicts.length
        ? `: ${conflicts.length} sync conflict(s)`
        : `: ${statusText[conn.status].toLowerCase()}`}
      .{' '}
      <a className="link" href="/settings#google-heading">
        Open Settings →
      </a>
    </p>
  );
}
