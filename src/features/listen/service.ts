import 'server-only';
import { db } from '@/server/db';
import { aiConfig } from '@/lib/env';
import { isTestNamed } from '@/lib/test-data';
import type { ScheduleUser } from '@/features/schedule/service';
import { DEFAULT_TICKS, studyInput } from '@/features/ai/domain';
import {
  AiRefusal,
  AiUnavailable,
  ask,
  ready,
  UNAVAILABLE,
  type Fetcher,
} from '@/features/ai/service';
import {
  crossCheck,
  droppedLine,
  LISTEN_FORMAT,
  LISTEN_LIMITS,
  listenMessages,
  paragraphsOf,
  pickPassages,
  readDraft,
  sourcePlan,
  tierOf,
  type CheckedLine,
  type Passage,
  type PlannedSource,
  type SkippedSource,
} from './domain';

export type ListenScript = {
  lines: CheckedLine[];
  /** The passages the kept lines rely on, in id order. */
  passages: Passage[];
  dropped: string | null;
  failed: { label: string; host: string }[];
  skipped: SkippedSource[];
};

/** Reads a response body up to `limit` bytes; a longer page is cut there. */
async function readLimited(res: Response, limit: number) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '',
    size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (size >= limit) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return text + decoder.decode();
}

/**
 * Fetches one listed page: HTTPS only, redirects followed by hand and only to listed sites
 * (at most three), HTML or plain text only, eight seconds and 1.5 MB at most.
 */
async function fetchPage(source: PlannedSource, fetcher: Fetcher) {
  let url = new URL(source.url);
  for (let hop = 0; hop <= LISTEN_LIMITS.redirects; hop++) {
    const res = await fetcher(url.href, {
      redirect: 'manual',
      headers: {
        Accept: 'text/html,text/plain;q=0.9',
        'User-Agent': 'Silsila/1.0 (personal study tool; usesilsila.me)',
      },
      signal: AbortSignal.timeout(LISTEN_LIMITS.timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const next = new URL(res.headers.get('location') ?? '', url);
      if (next.protocol !== 'https:' || !tierOf(next.hostname))
        throw new Error('Redirect');
      url = next;
      continue;
    }
    if (!res.ok) throw new Error('Status');
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type))
      throw new Error('Type');
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return {
      source: { ...source, url: url.href, host, tier: tierOf(host)! },
      paragraphs: paragraphsOf(
        await readLimited(res, LISTEN_LIMITS.bytes),
        type,
      ),
    };
  }
  throw new Error('Redirect');
}

/**
 * Listen on one roadmap item (WI-037). Only after the owner presses it: the item's listed
 * references are fetched, the passages that match the item are picked, and one request asks
 * the pinned model for a script from those passages only. The cross-check then keeps a line
 * only when an official passage, or passages from two sites, support it. Nothing is stored;
 * the ledger row holds no content.
 */
export async function listen(
  user: ScheduleUser,
  itemId: string,
  now = new Date(),
  fetcher: Fetcher = fetch,
): Promise<ListenScript> {
  const cfg = aiConfig();
  if (!cfg) throw new AiRefusal(UNAVAILABLE);
  const item = await db().roadmapItem.findFirst({
    where: { id: itemId, userId: user.id },
    include: { roadmap: { select: { title: true, studyAi: true } } },
  });
  if (!item)
    throw new AiRefusal('This item no longer exists. Reload the page.');
  if (!item.roadmap.studyAi)
    throw new AiRefusal('Study AI is off for this roadmap.');
  if (isTestNamed(item.title, item.roadmap.title))
    throw new AiRefusal('Listen skips test records.');
  const plan = sourcePlan(item.references);
  if (!plan.fetch.length)
    throw new AiRefusal('This item has no checked sources to listen from.');
  await ready(user, cfg, now, fetcher);
  const fetchedAt = now.toISOString();
  const results = await Promise.allSettled(
    plan.fetch.map((s) => fetchPage(s, fetcher)),
  );
  const failed: ListenScript['failed'] = [];
  const pages = results.flatMap((r, i) => {
    if (r.status === 'fulfilled' && r.value.paragraphs.length)
      return [{ ...r.value, fetchedAt }];
    failed.push({ label: plan.fetch[i].label, host: plan.fetch[i].host });
    return [];
  });
  const payload = studyInput(item, DEFAULT_TICKS(item));
  const passages = pickPassages(
    pages,
    [payload.topic, payload.scope, payload.doneWhen].filter(Boolean).join(' '),
  );
  console.info(
    `[listen] sources ${JSON.stringify({ fetched: pages.length, failed: failed.length, passages: passages.length })}`,
  );
  if (!pages.length)
    throw new AiRefusal('Couldn’t read this item’s sources right now.');
  const official = passages.some((p) => p.tier === 'official');
  if (
    passages.length < 2 ||
    (!official && new Set(passages.map((p) => p.host)).size < 2)
  )
    throw new AiRefusal(
      'The sources have too little on this topic for a checked script: it needs official documentation or two different sites.',
    );
  const draft = await ask({
    user,
    cfg,
    feature: 'LISTEN_ITEM',
    messages: listenMessages(payload, passages),
    format: LISTEN_FORMAT,
    read: readDraft,
    now,
    fetcher,
    failure: 'Couldn’t write a script for this item. Try again later.',
  });
  const checked = crossCheck(draft, passages);
  console.info(
    `[listen] checked ${JSON.stringify({ kept: checked.lines.length, ...checked.dropped })}`,
  );
  if (checked.lines.length < LISTEN_LIMITS.minLines)
    throw new AiUnavailable(
      'Too little of the script could be checked against its sources, so none of it is shown.',
    );
  const used = new Set(checked.lines.flatMap((l) => l.sources));
  return {
    lines: checked.lines,
    passages: passages.filter((p) => used.has(p.id)),
    dropped: droppedLine(checked.dropped),
    failed,
    skipped: plan.skipped,
  };
}
