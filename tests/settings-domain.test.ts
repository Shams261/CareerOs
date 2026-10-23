import { describe, it, expect } from 'vitest';
import {
  reminderContext,
  settingsSummary,
} from '../src/features/settings/domain';

describe('settings lines (WI-025)', () => {
  it('reads a reminder as its time and state', () => {
    expect(
      reminderContext(
        { enabled: true, preferredTime: '21:30', offsetMinutes: null },
        { time: '21:30' },
      ),
    ).toBe('21:30 · On');
    expect(reminderContext(null, { time: '18:00' })).toBe('18:00 · Off');
    expect(
      reminderContext(
        { enabled: true, preferredTime: null, offsetMinutes: 45 },
        { offset: 60 },
      ),
    ).toBe('45 min before · On');
    expect(reminderContext(null, { offset: 60 })).toBe('60 min before · Off');
  });
  it('writes the header line from the account, the theme, the devices and the calendar', () => {
    const now = new Date('2026-10-23T20:00:00Z');
    expect(
      settingsSummary({
        email: 'owner@example.com',
        timezone: 'America/Toronto',
        theme: 'light',
        devices: 2,
        calendar: {
          status: 'CONNECTED',
          lastSync: new Date('2026-10-23T19:53:00Z'),
        },
        now,
      }),
    ).toBe(
      'owner@example.com · America/Toronto · Light theme · Reminders on 2 devices · Google Calendar connected, synced 7 minutes ago',
    );
    expect(
      settingsSummary({
        email: 'owner@example.com',
        timezone: 'UTC',
        theme: 'dark',
        devices: 0,
        calendar: null,
        now,
      }),
    ).toBe(
      'owner@example.com · UTC · Dark theme · Reminders on no device yet · Google Calendar not connected',
    );
    expect(
      settingsSummary({
        email: 'o@e.com',
        timezone: 'UTC',
        theme: 'light',
        devices: 1,
        calendar: { status: 'REAUTH_REQUIRED', lastSync: null },
        now,
      }),
    ).toContain('Google Calendar needs attention');
  });
});
