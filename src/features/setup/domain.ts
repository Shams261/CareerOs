/**
 * Make Silsila yours (WI-050): the one-time steps from an empty workspace to a real day, each
 * read from the owner's own records, never ticked by hand. Pure; the service loads the facts.
 */
export type SetupFacts = {
  /** An active goal with a target date (the Roadmap's ready line needs it). */
  goalDate: boolean;
  /** Enabled routines. */
  routines: number;
  /** The owner saved Study nudges, so the study kinds are theirs. */
  studyKinds: boolean;
  calendar: 'CONNECTED' | 'REAUTH_REQUIRED' | 'ERROR' | 'DISCONNECTED' | null;
  /** Devices with push on (not revoked). */
  devices: number;
  /** Applications that are not test records. */
  applications: number;
};

export type SetupStep = {
  key: string;
  title: string;
  done: boolean;
  /** The words on the way there. */
  action: string;
  href: string;
  /** A side panel to open once the page shows its opener. */
  panel?: string;
};

export function setupSteps(f: SetupFacts): SetupStep[] {
  return [
    {
      key: 'goal',
      title: 'Set the date you are aiming for',
      done: f.goalDate,
      action: 'Set date',
      href: '/roadmap',
      panel: 'goals',
    },
    {
      key: 'routines',
      title: 'Add the times you really study',
      done: f.routines > 0,
      action: 'Add routine',
      href: '/calendar',
      panel: 'routines',
    },
    {
      key: 'kinds',
      title: 'Choose your study kinds',
      done: f.studyKinds,
      action: 'Choose',
      href: '/settings#reminders',
      panel: 'reminder-study',
    },
    {
      key: 'calendar',
      title:
        f.calendar &&
        f.calendar !== 'CONNECTED' &&
        f.calendar !== 'DISCONNECTED'
          ? 'Reconnect Google Calendar'
          : 'Connect Google Calendar',
      done: f.calendar === 'CONNECTED',
      action: 'Connect',
      href: '/settings#calendar',
    },
    {
      key: 'push',
      title: 'Turn on notifications on your phone',
      done: f.devices > 0,
      action: 'Turn on',
      href: '/settings#reminders',
    },
    {
      key: 'jobs',
      title: 'Add a real application',
      done: f.applications > 0,
      action: 'Add',
      href: '/jobs',
    },
  ];
}

/** "3 of 6 done"; the card leaves once every step is done. */
export const setupLine = (steps: SetupStep[]) =>
  `${steps.filter((s) => s.done).length} of ${steps.length} done`;
export const setupComplete = (steps: SetupStep[]) => steps.every((s) => s.done);

/** The cookie that hides the card on Today for a week; Settings keeps the list. */
export const SETUP_COOKIE = 'silsila-setup-hidden';
