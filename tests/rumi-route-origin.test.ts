import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const owner = vi.fn();
vi.mock('@/server/db', () => ({ owner }));
vi.mock('@/features/agent/service', () => ({
  askRumi: vi.fn(),
  noteMemories: vi.fn(),
}));
vi.mock('@/features/agent/after-writes', () => ({ afterWrites: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

/** WI-145: the Rumi stream refuses a missing, foreign or malformed Origin before any read. */
describe('POST /api/rumi/ask origin check', () => {
  it('answers 403, never a 500, and never resolves the owner', async () => {
    const { POST } = await import('../src/app/api/rumi/ask/route');
    const ask = (headers: Record<string, string>) =>
      POST(
        new Request('https://usesilsila.me/api/rumi/ask', {
          method: 'POST',
          headers: { host: 'usesilsila.me', ...headers },
          body: '{}',
        }),
      );
    for (const origin of [
      undefined,
      'https://evil.example',
      'not a url',
      'null',
    ])
      expect(
        (await ask(origin === undefined ? {} : { origin })).status,
        String(origin),
      ).toBe(403);
    expect(owner).not.toHaveBeenCalled();
  });
});
