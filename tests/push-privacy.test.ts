import { describe, expect, it } from 'vitest';
import { NotificationType } from '../src/generated/prisma/client';
import {
  LOCK_SCREEN_TEXT,
  lockScreenText,
  pushPayload,
} from '../src/features/push/domain';

// Fictional names of the kind reminders carry in the inbox; none may reach a lock screen.
const names = [
  'Northwind Labs',
  'Hiring manager chat',
  'Two pointers practice',
  'HTTP semantics',
  'Reply to recruiter',
  'Pat Example',
];

describe('lock-screen privacy (R2)', () => {
  it('has a general line for every reminder type', () => {
    for (const type of Object.values(NotificationType))
      expect(LOCK_SCREEN_TEXT[type], type).toBeTruthy();
  });

  it('never puts a block, company, round, note or item name in a push', () => {
    for (const type of Object.values(NotificationType)) {
      const payload = pushPayload({
        id: `n-${type}`,
        type,
        title: `${names.join(' — ')} starts in 15 minutes.`,
        dedupeKey: `u:${type}:entity:2026-10-27`,
      });
      for (const name of names) expect(payload, type).not.toContain(name);
      expect(JSON.parse(payload)).toMatchObject({
        title: 'Silsila',
        body: lockScreenText(type),
        tag: `n-${type}`,
      });
    }
  });

  it('falls back to a general line for an unknown type', () => {
    expect(lockScreenText('SOMETHING_NEW')).toBe(
      'You have a Silsila reminder.',
    );
  });
});
