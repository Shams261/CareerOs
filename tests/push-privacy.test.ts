import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NotificationType } from '../src/generated/prisma/client';
import {
  LOCK_SCREEN_TEXT,
  lockScreenText,
  pushPayload,
  pushImage,
  PUSH_IMAGE,
  PUSH_IMAGE_PATH,
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

describe('push pictures (WI-112)', () => {
  it('names only fixed pictures that exist, and every picture is named', () => {
    const files = new Set(
      readdirSync(join(__dirname, '..', 'public', 'notify')),
    );
    const named = new Set<string>();
    for (const type of Object.values(NotificationType)) {
      const image = pushImage(type);
      if (!image) continue;
      expect(image, type).toMatch(PUSH_IMAGE_PATH);
      expect(files.has(image.split('/').pop()!), type).toBe(true);
      named.add(image.split('/').pop()!);
    }
    expect([...files].sort()).toEqual([...named].sort());
    // Every type that has a picture is a real type.
    for (const type of Object.keys(PUSH_IMAGE))
      expect(Object.values(NotificationType) as string[]).toContain(type);
  });
  it('lets the service worker show only the same picture paths', () => {
    const sw = readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf8');
    expect(sw).toContain(PUSH_IMAGE_PATH.source);
  });
});

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
