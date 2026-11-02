import { owner } from '@/server/db';
import { GoogleCalendarPanel } from '@/features/calendar/panel';
import { SettingsIndex } from '@/features/settings/index-nav';
import { settingsPage } from '@/features/settings/page-data';
import { SettingsHead } from '@/features/settings/sections/head';
import { SetupSteps } from '@/features/settings/sections/setup';
import { RemindersGroup } from '@/features/settings/sections/reminders';
import { AppearanceGroup } from '@/features/settings/sections/appearance';
import { AccountGroup } from '@/features/settings/sections/account';
import { DataGroup } from '@/features/settings/sections/data';
export const metadata = { title: 'Settings' };

const groups = [
  { id: 'reminders', label: 'Reminders' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
  { id: 'data', label: 'Data' },
];

/** Settings as rows (WI-025): one record line, then the groups, read from one loader (WI-127). */
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; reason?: string }>;
}) {
  const user = await owner();
  const v = await settingsPage(user, await searchParams, new Date());
  return (
    <>
      <SettingsHead v={v} />
      <div className="settings-layout">
        <SettingsIndex sections={groups} />
        <div className="settings-main">
          {v.remaining.length > 0 && <SetupSteps v={v} />}
          <RemindersGroup v={v} />
          <section
            id="calendar"
            className="settings-group"
            aria-labelledby="google-heading"
          >
            <GoogleCalendarPanel user={user} flash={v.flash} />
          </section>
          <AppearanceGroup v={v} />
          <AccountGroup v={v} />
          <DataGroup v={v} />
        </div>
      </div>
    </>
  );
}
