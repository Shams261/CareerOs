import { Laptop, UserRound } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { SidePanel } from '@/components/side-panel';
import { nameAction } from '../name-action';
import { signOutOthersAction } from '@/features/auth/actions';
import { deviceLabel } from '@/lib/user-agent';
import { formatInTimeZone } from 'date-fns-tz';
import { SettingRow } from '../rows';
import type { SettingsView } from '../page-data';

/** Account: the owner, sessions, and the name and sessions panels. */
export function AccountGroup({ v }: { v: SettingsView }) {
  const { user, sessions } = v;
  return (
    <section
      id="account"
      className="settings-group"
      aria-labelledby="account-heading"
    >
      <div className="agenda-head">
        <h2 id="account-heading" className="agenda-heading">
          Account
        </h2>
      </div>
      <ul className="plain-list attention-list">
        <SettingRow
          source="job"
          icon={<UserRound size={22} />}
          label="Owner"
          title={user.email}
          context={`${user.timezone} · signed in with Google`}
        />
        <SettingRow
          source="job"
          icon={<Laptop size={22} />}
          label="Sessions"
          title={
            sessions.length === 1
              ? 'Signed in on this device only'
              : `Signed in on ${sessions.length} devices`
          }
          context="Where you are signed in, and sign out the others"
          panel="sessions"
        />
      </ul>
      <SidePanel id="name" title="Your name" variant="modal">
        <ActionForm action={nameAction} label="Your name" closeOnSuccess>
          <label>
            Name
            <input
              name="name"
              required
              maxLength={60}
              defaultValue={user.name}
              autoComplete="given-name"
            />
          </label>
          <Button className="mt-3">Save</Button>
        </ActionForm>
      </SidePanel>
      <SidePanel id="sessions" title="Sessions">
        <ul className="plain-list session-list">
          {sessions.map((s) => (
            <li key={s.id} className="session-row">
              <strong>
                {deviceLabel(s.userAgent)}
                {s.current && <span className="pill success">This device</span>}
              </strong>
              <span className="muted">
                Last active{' '}
                {formatInTimeZone(s.lastSeenAt, user.timezone, 'MMM d, HH:mm')}{' '}
                · signed in{' '}
                {formatInTimeZone(s.createdAt, user.timezone, 'MMM d')}
              </span>
            </li>
          ))}
        </ul>
        {sessions.length > 1 && (
          <ActionForm
            action={signOutOthersAction}
            label="Sign out other devices"
            className="mt-4"
          >
            <Button className="secondary">Sign out other devices</Button>
          </ActionForm>
        )}
      </SidePanel>
    </section>
  );
}
