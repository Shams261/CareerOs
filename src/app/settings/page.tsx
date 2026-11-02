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
import { RumiGroup } from '@/features/settings/sections/rumi';
import { AGENT_NAME } from '@/features/agent/constants';
export const metadata = { title: 'Settings' };

// WI-141: the owner first, then what reminds, Rumi and AI together, the calendar, the look and
// the data.
const groups = [
  { id: 'account', label: 'Account' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'rumi', label: `${AGENT_NAME} and AI` },
  { id: 'calendar', label: 'Calendar' },
  { id: 'appearance', label: 'Appearance' },
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
          <AccountGroup v={v} />
          <RemindersGroup v={v} />
          <RumiGroup v={v} />
          <section
            id="calendar"
            className="settings-group"
            aria-labelledby="google-heading"
          >
            <GoogleCalendarPanel user={user} flash={v.flash} />
          </section>
          <AppearanceGroup v={v} />
          <DataGroup v={v} />
        </div>
      </div>
    </>
  );
}
