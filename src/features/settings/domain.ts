/**
 * Pure helpers for the Settings page (WI-025): the one record line and the context each
 * reminder row shows. Covered by tests/settings-domain.test.ts.
 */
import { formatDistance } from 'date-fns';

export type ReminderPref = {
  enabled: boolean;
  preferredTime: string | null;
  offsetMinutes: number | null;
} | null;

/** "21:30 · On", "18:00 · Off", "60 min before · On". */
export function reminderContext(
  pref: ReminderPref,
  fallback: { time?: string; offset?: number },
) {
  const on = pref?.enabled ? 'On' : 'Off';
  if (fallback.offset !== undefined)
    return `${pref?.offsetMinutes ?? fallback.offset} min before · ${on}`;
  return `${pref?.preferredTime ?? fallback.time ?? '09:00'} · ${on}`;
}

/** The header's record line: who, where, how it looks, what reaches you. */
export function settingsSummary(input: {
  email: string;
  timezone: string;
  theme: 'light' | 'dark';
  devices: number;
  calendar: { status: string; lastSync: Date | null } | null;
  now: Date;
}) {
  const parts = [
    input.email,
    input.timezone,
    `${input.theme === 'dark' ? 'Dark' : 'Light'} theme`,
    input.devices
      ? `Reminders on ${input.devices} device${input.devices === 1 ? '' : 's'}`
      : 'Reminders on no device yet',
  ];
  const c = input.calendar;
  if (c && c.status !== 'DISCONNECTED')
    parts.push(
      c.status === 'CONNECTED'
        ? `Google Calendar connected${c.lastSync ? `, synced ${formatDistance(c.lastSync, input.now, { addSuffix: true })}` : ''}`
        : 'Google Calendar needs attention',
    );
  else parts.push('Google Calendar not connected');
  return parts.join(' · ');
}
