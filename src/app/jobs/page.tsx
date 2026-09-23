import { db, owner } from '@/server/db';
import { ResourceLink } from '@/components/resource-link';
import { formatInTimeZone } from 'date-fns-tz';
export default async function Jobs() {
  const user = await owner();
  const [jobs, block] = await Promise.all([
    db().jobApplication.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    }),
    db().timeBlock.findFirst({
      where: {
        dailyPlan: { userId: user.id },
        category: 'JOB_SEARCH',
        plannedStart: { gte: new Date() },
        status: 'PLANNED',
      },
      orderBy: { plannedStart: 'asc' },
    }),
  ]);
  return (
    <>
      <p className="eyebrow">Your next chapter</p>
      <h1>Keep the right doors open.</h1>
      <section className="hero">
        <div>
          <p className="eyebrow">Next job search block</p>
          <h2>
            {block
              ? formatInTimeZone(
                  block.plannedStart,
                  user.timezone,
                  'EEEE, MMM d · h:mm a',
                )
              : 'No upcoming block scheduled'}
          </h2>
          <p className="muted">
            {block
              ? `${block.title} · until ${formatInTimeZone(block.plannedEnd, user.timezone, 'h:mm a')}`
              : 'Generate a daily plan from your routines to reserve application time.'}
          </p>
        </div>
      </section>
      <section className="card">
        <h2>
          Application pipeline{' '}
          <span className="muted">· {jobs.length} opportunities</span>
        </h2>
        {jobs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company / role</th>
                  <th>Stage</th>
                  <th>Applied</th>
                  <th>Next action</th>
                  <th>Posting</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <h3>{j.company}</h3>
                      <p className="muted">{j.role}</p>
                    </td>
                    <td>
                      <span className="pill">
                        {j.stage.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {j.appliedAt
                        ? formatInTimeZone(j.appliedAt, user.timezone, 'MMM d')
                        : 'Not applied'}
                    </td>
                    <td>
                      {j.nextAction ?? 'None'}
                      <p className="muted">
                        {j.nextActionAt
                          ? formatInTimeZone(
                              j.nextActionAt,
                              user.timezone,
                              'MMM d, h:mm a',
                            )
                          : ''}
                      </p>
                    </td>
                    <td>
                      <ResourceLink url={j.jobUrl}>View</ResourceLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Your application pipeline is clear.</div>
        )}
      </section>
    </>
  );
}
