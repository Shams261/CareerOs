import { Button } from '@/components/ui/button';
import { UtilityMenu } from '@/features/today/utility-menu';
import { signOutAction } from '@/features/auth/actions';
import { settingsSummary } from '../domain';
import type { SettingsView } from '../page-data';

/** The title, Sign out and the one record line (WI-025). */
export function SettingsHead({ v }: { v: SettingsView }) {
  const { user, now, theme, devices, calendar } = v;
  return (
    <header className="today-head">
      <div className="today-head-row">
        <div className="today-title">
          <h1>Settings</h1>
        </div>
        <UtilityMenu>
          <form action={signOutAction}>
            <Button className="secondary">Sign out</Button>
          </form>
        </UtilityMenu>
      </div>
      <p className="today-summary">
        {settingsSummary({
          email: user.email,
          timezone: user.timezone,
          theme,
          devices,
          calendar: calendar
            ? {
                status: calendar.status,
                lastSync: calendar.lastSuccessfulSyncAt,
              }
            : null,
          now,
        })}
      </p>
    </header>
  );
}
