import Link from 'next/link';
import type { Metadata } from 'next';
import { BrandLogo } from '@/components/brand';
import { privacyContact } from '@/lib/env';
import { currentSession } from '@/server/session';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Silsila stores, what it asks Google for, and how to remove it.',
  robots: { index: true, follow: false },
};

/** Published for the Google OAuth consent screen; readable signed out, no personal data. */
export default async function Privacy() {
  const signedIn = !!(await currentSession());
  const contact = privacyContact();
  return (
    <article className="card policy" aria-labelledby="privacy-heading">
      {!signedIn && (
        <p className="policy-brand">
          <Link href="/login" aria-label="Silsila sign-in">
            <BrandLogo />
          </Link>
        </p>
      )}
      <p className="eyebrow">Silsila · usesilsila.me</p>
      <h1 id="privacy-heading">Privacy</h1>
      <p className="policy-updated">Last updated 23 October 2026</p>
      <p>
        Silsila is a personal execution system run by one person for their own
        use: it turns routines into a dated plan, records what happened, tracks
        study revision and job applications, and can mirror planned blocks into
        a Google calendar. There are no other users and no accounts to create.
        This page says what Silsila stores, what it asks Google for, and how
        that data is removed.
      </p>

      <h2>Signing in with Google</h2>
      <p>
        Silsila signs in with Google using the <code>openid</code> and{' '}
        <code>email</code> scopes. Google tells Silsila the email address of the
        account that signed in; Silsila checks it against the one owner email it
        is configured with and refuses every other account without storing
        anything about it. No Google access token or refresh token is kept for
        sign-in. A successful sign-in creates a server-side session row holding
        a hashed token, the browser&rsquo;s user agent and timestamps; the
        browser keeps one HTTP-only cookie for 30 days, revoked on sign-out.
      </p>

      <h2>Google Calendar (optional)</h2>
      <p>
        If the owner connects Google Calendar, Silsila asks for the{' '}
        <code>calendar.app.created</code> scope. That scope lets Silsila create
        one calendar of its own and read, add, change and delete events only in
        that calendar; it cannot see any other calendar in the account. Silsila
        writes its planned blocks there, reads changes the owner makes to those
        events, and never touches events it did not create. The refresh token
        Google returns is stored encrypted (AES-256-GCM) and is used only to
        sync that calendar. &ldquo;Disconnect&rdquo; in Settings deletes the
        token; removing Silsila under Google Account &rarr; Security &rarr;
        Third-party connections has the same effect.
      </p>
      <p>
        Silsila&rsquo;s use of information received from Google APIs adheres to
        the{' '}
        <a
          className="link"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Google data is used only to
        provide the calendar mirror the owner asked for; it is never sold,
        shared, used for advertising, or read by a person other than the owner.
      </p>

      <h2>What Silsila stores</h2>
      <ul>
        <li>
          Routines, dated plans, planned blocks and recorded sessions, daily
          check-ins, weekly reviews and priorities, goals and roadmaps.
        </li>
        <li>
          Practice problems and attempts, learning topics and activities, all
          written by the owner.
        </li>
        <li>
          Job applications and interview rounds, including notes the owner
          writes about companies, contacts, compensation and reflections.
        </li>
        <li>
          Reminder preferences, the Web Push subscriptions of devices the owner
          enabled, and reminders delivered to the in-app inbox.
        </li>
        <li>
          Revision cards the owner keeps from Grill Me, and a ledger of each AI
          request with its model, token counts and cost. No prompt or answer
          text is stored.
        </li>
        <li>
          Two cookies: the session cookie above and a theme preference. No
          analytics, advertising or tracking cookies.
        </li>
      </ul>
      <p>
        Everything above is the owner&rsquo;s own material. Server logs use a
        fixed vocabulary and never contain tokens, notes, contacts, reflections
        or email bodies.
      </p>

      <h2>Where it lives and who can see it</h2>
      <p>
        The application runs on Render (United States) and the database on
        Supabase (Canada), each under its own terms. A scheduler service calls
        two protected endpoints to deliver reminders and run calendar sync; it
        receives no personal data. Google receives only the calendar events
        Silsila writes to its own calendar and the push messages it delivers
        through the browser&rsquo;s push service.
      </p>
      <p>
        Grill Me (optional) sends a roadmap item&rsquo;s title, scope,
        &ldquo;done when&rdquo; line and reference names, only the ones the
        owner ticks and sees before sending, through OpenRouter to Claude Haiku
        5.5 on Google Vertex AI, using an endpoint with zero data retention and
        no fallback to another provider. Notes, the schedule, sessions, jobs and
        reflections are never sent. Nothing is shared with anyone else, and
        nothing is sold.
      </p>

      <h2>Keeping and removing data</h2>
      <p>
        Data is kept for as long as the owner uses Silsila. Settings offers a
        JSON export of every record (without credentials or device keys),
        disconnecting Google Calendar, and disabling push on a device. Because
        there is one owner, deleting the workspace means deleting the database,
        which the owner can do at any time; Google access can be revoked from
        the Google account at any time.
      </p>

      <h2>Security</h2>
      <p>
        Everything is served over HTTPS with a strict content security policy.
        Sessions are server-side rows, cookies are HTTP-only and same-site, the
        calendar token is encrypted at rest, and the scheduler endpoints require
        a secret. A full description is kept with the source code.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If this page changes, the date at the top changes with it. Questions
        about this policy or the data go to{' '}
        <a className="link" href={`mailto:${contact}`}>
          {contact}
        </a>
        .
      </p>
      <p className="policy-foot">
        {signedIn ? (
          <Link className="link" href="/settings">
            Back to Settings
          </Link>
        ) : (
          <Link className="link" href="/login">
            Sign in
          </Link>
        )}
      </p>
    </article>
  );
}
