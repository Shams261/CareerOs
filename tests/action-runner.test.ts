import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { redirect } from 'next/navigation';

vi.mock('server-only', () => ({}));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));
const forgetAll = vi.fn();
vi.mock('../src/server/memo', () => ({ forgetAll: () => forgetAll() }));

import { ownerWords, UserError, withReference } from '../src/lib/action-error';
import { failure, runAction, SAVE_FAILED } from '../src/server/action';

class Custom extends Error {}
afterEach(() => vi.restoreAllMocks());

describe('ownerWords (WI-122)', () => {
  it('keeps the words of a plain refusal and of a UserError', () => {
    expect(ownerWords(new Error('This interview no longer exists.'))).toBe(
      'This interview no longer exists.',
    );
    expect(ownerWords(new UserError('Your monthly AI limit is reached.'))).toBe(
      'Your monthly AI limit is reached.',
    );
  });
  it('never speaks for an unexpected error', () => {
    expect(
      ownerWords(
        new TypeError("Cannot read properties of undefined (reading 'id')"),
      ),
    ).toBeNull();
    expect(ownerWords(new RangeError('Invalid time value'))).toBeNull();
    expect(ownerWords(new Custom('internal'))).toBeNull();
    expect(
      ownerWords(
        Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
      ),
    ).toBeNull();
    expect(
      ownerWords(
        Object.assign(new Error('NEXT_REDIRECT'), {
          digest: 'NEXT_REDIRECT;replace;/login',
        }),
      ),
    ).toBeNull();
    expect(ownerWords('a string')).toBeNull();
    expect(ownerWords(new Error(''))).toBeNull();
  });
});

describe('failure (WI-122)', () => {
  it('rethrows Next control flow instead of showing it', () => {
    let thrown: unknown;
    try {
      redirect('/login');
    } catch (error) {
      thrown = error;
    }
    expect(() => failure(thrown, 'test')).toThrow();
  });
  it('reads validation as field messages and keeps an owner refusal', () => {
    const zod = z
      .object({ title: z.string().min(1, 'Add a title.') })
      .safeParse({ title: '' });
    expect(failure(zod.error, 'test')).toBe('Title: Add a title.');
    expect(failure(new Error('Another session is running.'), 'test')).toBe(
      'Another session is running.',
    );
  });
  it('hides an unexpected error behind a reference and logs no text', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secret = 'select * from "User" where email = owner@example.com';
    const message = failure(
      Object.assign(new Error(secret), { code: 'P2010' }),
      'jobs',
    );
    const ref = /Reference ([0-9a-f]{8})\.$/.exec(message)?.[1];
    expect(ref).toBeTruthy();
    expect(message).toBe(withReference(SAVE_FAILED, ref!));
    expect(log).toHaveBeenCalledWith(
      '[jobs] action failed',
      'Error',
      'P2010',
      `ref ${ref}`,
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('owner@example.com');
  });
});

describe('runAction (WI-122)', () => {
  it('drops the snapshots, revalidates every page and runs the follow-up on success', async () => {
    const after = vi.fn();
    const result = await runAction(
      async () => ({ message: 'Saved.', undo: { kind: 'x', payload: 1 } }),
      {
        area: 'test',
        after,
      },
    );
    expect(result).toEqual({
      message: 'Saved.',
      undo: { kind: 'x', payload: 1 },
      ok: true,
    });
    expect(forgetAll).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(after).toHaveBeenCalled();
  });
  it('a failing follow-up never turns a saved change into a failure', async () => {
    const result = await runAction(async () => 'Saved.', {
      area: 'test',
      after: () => {
        throw new Error('calendar down');
      },
    });
    expect(result).toEqual({ message: 'Saved.', ok: true });
  });
  it('answers a feature error through known, the rest through failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const known = (error: unknown) =>
      error instanceof Custom
        ? { message: 'Possible duplicate.', token: 't' }
        : undefined;
    expect(
      await runAction(
        async () => {
          throw new Custom('x');
        },
        { area: 'test', known },
      ),
    ).toEqual({ message: 'Possible duplicate.', token: 't' });
    const other = await runAction(
      async () => {
        throw new TypeError('boom');
      },
      { area: 'test', known, fallback: 'Could not save it.' },
    );
    expect(other.ok).toBeUndefined();
    expect(other.message).toMatch(
      /^Could not save it\. Reference [0-9a-f]{8}\.$/,
    );
  });
  it('lets a redirect inside the work through', async () => {
    await expect(
      runAction(async () => redirect('/login'), { area: 'test' }),
    ).rejects.toThrow();
  });
});
