import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { forgetAll, memo } from '../src/server/memo';

describe('snapshot memo', () => {
  beforeEach(() => {
    process.env.SNAPSHOT_CACHE = 'on';
    forgetAll();
  });
  afterEach(() => {
    delete process.env.SNAPSHOT_CACHE;
    vi.useRealTimers();
  });
  it('serves a second read within the window without loading again', async () => {
    const load = vi.fn(async () => ({ n: 1 }));
    expect(await memo('u', 'x', load)).toEqual({ n: 1 });
    expect(await memo('u', 'x', load)).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('keys by owner and name', async () => {
    const a = vi.fn(async () => 'a'),
      b = vi.fn(async () => 'b');
    expect(await memo('u', 'x', a)).toBe('a');
    expect(await memo('v', 'x', b)).toBe('b');
    expect(await memo('u', 'y', b)).toBe('b');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
  it('expires, is dropped by forgetAll, and never caches a failure', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => Date.now());
    await memo('u', 'x', load, 1000);
    vi.advanceTimersByTime(1500);
    await memo('u', 'x', load, 1000);
    expect(load).toHaveBeenCalledTimes(2);
    forgetAll();
    await memo('u', 'x', load, 1000);
    expect(load).toHaveBeenCalledTimes(3);
    const failing = vi.fn(async () => {
      throw new Error('db down');
    });
    await expect(memo('u', 'f', failing)).rejects.toThrow('db down');
    await expect(memo('u', 'f', failing)).rejects.toThrow('db down');
    expect(failing).toHaveBeenCalledTimes(2);
  });
  it('shares one cache between copies of the module, so any copy clears it (WI-062)', async () => {
    // The build compiles memo.ts once per layer; a fresh import stands in for the second copy.
    vi.resetModules();
    const other = await import('../src/server/memo');
    expect(other.memo).not.toBe(memo);
    const load = vi.fn(async () => 1);
    await memo('u', 'shared', load);
    await other.memo('u', 'shared', load);
    expect(load).toHaveBeenCalledTimes(1);
    const cleared = vi.fn();
    other.onForget(cleared);
    forgetAll();
    expect(cleared).toHaveBeenCalled();
    await other.memo('u', 'shared', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('is off under test unless switched on', async () => {
    delete process.env.SNAPSHOT_CACHE;
    const load = vi.fn(async () => 1);
    await memo('u', 'x', load);
    await memo('u', 'x', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
