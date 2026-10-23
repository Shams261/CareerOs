import { formatDistance } from 'date-fns';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { SidePanel } from '@/components/side-panel';
import { SettingRow } from '@/features/settings/rows';
import { Calendar, Unplug } from 'lucide-react';
import { DisconnectForm } from './disconnect-form';
import type { ScheduleUser } from '@/features/schedule/service';
import { calendarConfig } from '@/lib/env';
import { db } from '@/server/db';
import {
  categoriesAction,
  connectCalendarAction,
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
import { categoryGroup } from '@/features/review/domain';
import { ArrowRight } from 'lucide-react';

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
      <>
        <div className="agenda-head">
          <h2 id="google-heading" className="agenda-heading">
            Google Calendar
          </h2>
        </div>
        <p className="status-line">
          <span>Not configured on this server.</span>
        </p>
      </>
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
  const noticeNode = notice && (
    <p
      role="status"
      className={flash?.google === 'error' ? 'form-message' : 'form-success'}
    >
      {notice}
    </p>
  );
  if (!connected)
    return (
      <>
        <div className="agenda-head">
          <h2 id="google-heading" className="agenda-heading">
            Google Calendar
          </h2>
          <form action={connectCalendarAction}>
            <Button className="secondary">Connect Google Calendar</Button>
          </form>
        </div>
        {noticeNode}
        <p className="status-line">
          <span>
            Shows your planned blocks in a separate{' '}
            <strong>{conn?.calendarName ?? 'Silsila'}</strong> calendar in your
            Google account. Only that calendar is ever touched.
          </span>
        </p>
      </>
    );
  const lastSync = conn.lastSuccessfulSyncAt
    ? `synced ${formatDistance(conn.lastSuccessfulSyncAt, now, { addSuffix: true })}`
    : 'not synced yet';
  const updates = calendarConfig()?.webhookBaseUrl
    ? 'instant updates with a scheduled fallback'
    : 'scheduled updates';
  return (
    <>
      <div className="agenda-head">
        <h2 id="google-heading" className="agenda-heading">
          Google Calendar
        </h2>
        {conn.status === 'CONNECTED' ? (
          <ActionForm action={syncNowAction}>
            <Button>Sync now</Button>
          </ActionForm>
        ) : (
          <form action={connectCalendarAction}>
            <Button>Reconnect Google Calendar</Button>
          </form>
        )}
      </div>
      {noticeNode}
      {conn.lastSyncError && (
        <p role="alert" className="form-message">
          Sync failed:{' '}
          {errorMessages[conn.lastSyncError as CalendarErrorCode] ??
            errorMessages.unexpected}
        </p>
      )}
      <ul className="plain-list attention-list">
        <SettingRow
          source="roadmap"
          icon={<Calendar size={22} />}
          label={statusText[conn.status]}
          title={`${conn.calendarName ?? 'Silsila'} calendar · ${conn.accountEmail ?? 'unknown account'}`}
          context={`${lastSync} · ${health?.toLowerCase()} · ${updates} · ${pending} pending`}
        />
        <SettingRow
          source="roadmap"
          icon={<Calendar size={22} />}
          label="Scope"
          title="Categories to sync"
          context={`Last ${SYNC_WINDOW.pastDays} and next ${SYNC_WINDOW.futureDays} days · ${
            excluded.length
              ? `${categories.length - excluded.length} of ${categories.length} categories`
              : 'all categories'
          }`}
          panel="calendar-categories"
        />
        <SettingRow
          source="roadmap"
          icon={<Unplug size={22} />}
          label="Connection"
          title="Disconnect"
          context="Keeps the calendar; stops syncing"
          panel="calendar-disconnect"
        />
      </ul>
      <SidePanel id="calendar-categories" title="Categories to sync">
        <ActionForm
          action={categoriesAction}
          label="Sync categories"
          className="dsa-form"
          closeOnSuccess
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
              {categoryGroup(c)}
            </label>
          ))}
          <Button>Save categories</Button>
        </ActionForm>
      </SidePanel>
      <SidePanel id="calendar-disconnect" title="Disconnect Google Calendar">
        <DisconnectForm calendarName={conn.calendarName ?? 'Silsila'} />
      </SidePanel>
      <>
        {conflicts.length > 0 && (
          <div className="mt-4" aria-label="Sync conflicts">
            <h3>Sync conflicts · {conflicts.length}</h3>
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
      </>
    </>
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
        Open Settings <ArrowRight size={14} aria-hidden="true" />
      </a>
    </p>
  );
}
