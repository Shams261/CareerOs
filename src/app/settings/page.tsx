import { db, owner } from '@/server/db';
import { saveReminder } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { NotificationPermission } from '@/features/notifications/permission';
export default async function Settings() {
  const user = await owner();
  const pref = await db().notificationPreference.findUnique({
    where: { userId_type: { userId: user.id, type: 'DAILY_PROGRESS' } },
  });
  return (
    <>
      <p className="eyebrow">Make it yours</p>
      <h1>Workspace settings</h1>
      <section className="card mt-7">
        <h2>{user.name}</h2>
        <p className="muted">
          {user.email} · {user.timezone}
        </p>
      </section>
      <section className="card">
        <h2>Daily progress reminder</h2>
        <form action={saveReminder}>
          <label>
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={pref?.enabled ?? true}
            />{' '}
            Remind me when I haven’t reviewed my day
          </label>
          <label>
            Local reminder time{' '}
            <input
              aria-label="Local reminder time"
              required
              type="time"
              name="preferredTime"
              defaultValue={pref?.preferredTime ?? '21:30'}
            />
          </label>
          <p className="muted mb-4">
            Timezone: {pref?.timezone ?? user.timezone}. Requires the deployment
            scheduler.
          </p>
          <Button>Save preference</Button>
        </form>
      </section>
      <section className="card">
        <h2>Browser notifications</h2>
        <NotificationPermission />
      </section>
    </>
  );
}
