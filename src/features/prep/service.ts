import 'server-only';
/**
 * Interview prep docs (WI-042, ADR-024). Runs outside the chat loop and has no write tools:
 * code-built searches through the web plugin (Exa) on the pinned endpoint, then one writing
 * call that sees the research notes, the cited sources and the owner's own study items. Only
 * a checked doc is stored. Covered by tests/prep-database.test.ts.
 */
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/server/db';
import { aiConfig } from '@/lib/env';
import { dayKey, shortDate } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import type { ScheduleUser } from '@/features/schedule/service';
import {
  AiRefusal,
  AiUnavailable,
  ask,
  callModel,
  ready,
  settle,
  type CallWords,
  type Fetcher,
} from '@/features/ai/service';
import { AGENT_NAME } from '@/features/agent/domain';
import {
  citedSources,
  collectSources,
  DOCS_PER_DAY,
  estimateMicros,
  PREP_FORMAT,
  prepMessages,
  readPrepDoc,
  SEARCH_RESERVE_MICROS,
  searchBody,
  searchQueries,
  sourceKey,
  type PrepDoc,
  type PrepInput,
  type Source,
} from './domain';
import { aiPolicyLabel, typeText } from '@/features/jobs/formats';

export const UNAVAILABLE = `${AGENT_NAME} couldn’t prepare this right now.`;
const WORDS: CallWords = {
  unavailable: UNAVAILABLE,
  budgetUsed: (day) =>
    `This month’s AI budget is used. ${AGENT_NAME} returns on ${shortDate(day)}.`,
  log: '[prep] doc',
};

/** The application and what a doc would use, owner-scoped; the job description only on request. */
async function material(user: ScheduleUser, applicationId: string, now: Date) {
  const app = await db().jobApplication.findFirst({
    where: { id: applicationId, userId: user.id },
    select: {
      id: true,
      company: true,
      role: true,
      jobUrl: true,
      jobDescription: true,
      formats: true,
      rounds: {
        where: { status: 'SCHEDULED' },
        orderBy: { scheduledStart: 'asc' },
        select: {
          title: true,
          type: true,
          aiPolicy: true,
          scheduledStart: true,
        },
      },
    },
  });
  if (!app) throw new AiRefusal('This application no longer exists.');
  if (isTestNamed(app.company, app.role))
    throw new AiRefusal(`${AGENT_NAME} skips test records.`);
  const [items, problems] = await Promise.all([
    db().roadmapItem.findMany({
      where: {
        userId: user.id,
        roadmap: { studyAi: true, archivedAt: null },
      },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { ordering: 'asc' }],
      take: 120,
      select: {
        id: true,
        title: true,
        status: true,
        roadmap: { select: { title: true } },
      },
    }),
    db().dsaProblem.findMany({
      where: { userId: user.id },
      orderBy: [{ confidence: 'asc' }, { lastAttemptedAt: 'asc' }],
      take: 80,
      select: {
        id: true,
        title: true,
        confidence: true,
        topic: { select: { name: true } },
      },
    }),
  ]);
  const upcoming = app.rounds.filter((r) => r.scheduledStart >= now);
  return {
    app,
    rounds: (upcoming.length ? upcoming : app.rounds).map((r) => ({
      title: r.title,
      type: r.type,
      on: dayKey(r.scheduledStart, user.timezone),
      ...(r.aiPolicy !== 'UNKNOWN' ? { ai: aiPolicyLabel[r.aiPolicy] } : {}),
    })),
    // The formats ticked on the application (WI-047), in the owner's words.
    formats: app.formats.map(typeText),
    // Not-done items first, so the doc points at what is left.
    roadmap: items
      .filter((i) => !isTestNamed(i.title, i.roadmap.title))
      .sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE'))
      .map((i) => ({
        id: i.id,
        title: i.title,
        roadmap: i.roadmap.title,
        done: i.status === 'DONE',
      })),
    problems: problems
      .filter((p) => !isTestNamed(p.title))
      .map((p) => ({
        id: p.id,
        title: p.title,
        topic: p.topic.name,
        confidence: p.confidence.toLowerCase(),
      })),
  };
}

/** What Prepare with Rumi shows before anything is sent. */
export async function prepPreview(
  user: ScheduleUser,
  applicationId: string,
  now = new Date(),
) {
  const m = await material(user, applicationId, now);
  const queries = searchQueries({
    company: m.app.company,
    role: m.app.role,
    roundTypes: [...m.rounds.map((r) => r.type), ...m.app.formats],
  });
  return {
    queries,
    rounds: m.rounds.length,
    roadmapItems: Math.min(m.roadmap.length, 60),
    problems: Math.min(m.problems.length, 40),
    hasJobDescription: !!m.app.jobDescription?.trim(),
    estimateMicros: estimateMicros(queries.length),
  };
}

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Prepare with Rumi: the searches, then the doc. A search that fails is left out; fewer than
 * two answering searches, or fewer than two sources, writes nothing. The doc keeps only
 * sourced points and the owner's real items (`readPrepDoc`).
 */
export async function writePrepDoc(
  user: ScheduleUser,
  input: { applicationId: string; jobDescription: boolean },
  now = new Date(),
  fetcher: Fetcher = fetch,
) {
  const cfg = aiConfig();
  if (!cfg) throw new AiRefusal(UNAVAILABLE);
  await ready(user, cfg, now, fetcher, { requireEnabled: false });
  const made = await db().interviewPrepDoc.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(+now - 24 * 3600_000) },
    },
  });
  if (made >= DOCS_PER_DAY)
    throw new AiRefusal(
      `${AGENT_NAME} writes up to ${DOCS_PER_DAY} prep docs a day. Try again tomorrow.`,
    );
  const m = await material(user, input.applicationId, now);
  const queries = searchQueries({
    company: m.app.company,
    role: m.app.role,
    roundTypes: [...m.rounds.map((r) => r.type), ...m.app.formats],
  });
  const started = Date.now();
  const results = await Promise.allSettled(
    queries.map(async (query) => {
      const { usageId, answer, cost, durationMs } = await callModel({
        user,
        cfg,
        feature: 'PREP_RESEARCH',
        body: searchBody(query),
        reserve: SEARCH_RESERVE_MICROS,
        now,
        fetcher,
        words: WORDS,
      });
      const message = answer.choices?.[0]?.message;
      const text =
        typeof message?.content === 'string' ? message.content.trim() : '';
      const annotations = Array.isArray(message?.annotations)
        ? (message.annotations as unknown[])
        : [];
      await settle(usageId, {
        outcome: text ? 'OK' : 'FAILED',
        costMicros: cost.micros,
        inputTokens: cost.input,
        outputTokens: cost.output,
        durationMs,
      });
      return { query, text: text.slice(0, 1500), annotations };
    }),
  );
  // Answered outside the pinned endpoint during a search: AI is blocked, nothing is written.
  const setting = await db().aiSetting.findUnique({
    where: { userId: user.id },
  });
  if (setting?.blockedAt) throw new AiUnavailable(UNAVAILABLE);
  const found = results.flatMap((r) =>
    r.status === 'fulfilled' && r.value.text ? [r.value] : [],
  );
  const sources = collectSources(
    found.flatMap((f) => f.annotations),
    m.app.company,
    hostOf(m.app.jobUrl),
  );
  if (found.length < 2 || sources.length < 2) {
    console.error(
      `[prep] doc failed ${JSON.stringify({ searches: found.length, sources: sources.length })}`,
    );
    throw new AiUnavailable(
      `The searches found too little about ${m.app.company}’s interview to write a doc.`,
    );
  }
  const idOf = new Map(sources.map((s) => [s.url, s.id]));
  const prep: PrepInput = {
    company: m.app.company,
    role: m.app.role,
    rounds: m.rounds,
    formats: m.formats,
    notes: found.map((f) => ({
      query: f.query,
      text: f.text,
      sources: [
        ...new Set(
          f.annotations.flatMap((a) => {
            const id = idOf.get(sourceKey(a) ?? '');
            return id ? [id] : [];
          }),
        ),
      ],
    })),
    sources,
    roadmap: m.roadmap,
    problems: m.problems,
    jobDescription: input.jobDescription ? m.app.jobDescription : null,
  };
  const doc = await ask<PrepDoc>({
    user,
    cfg,
    feature: 'PREP_RESEARCH',
    messages: prepMessages(prep),
    format: PREP_FORMAT,
    read: (c) => readPrepDoc(c, prep),
    now,
    fetcher,
    failure: `${AGENT_NAME} couldn’t write a grounded doc from what the searches found.`,
    words: WORDS,
  });
  const cost = await db().aiUsage.aggregate({
    where: { userId: user.id, feature: 'PREP_RESEARCH', createdAt: now },
    _sum: { costMicros: true },
  });
  const cited = citedSources(doc, sources);
  const saved = await db().interviewPrepDoc.create({
    data: {
      userId: user.id,
      applicationId: m.app.id,
      company: m.app.company,
      role: m.app.role,
      queries,
      usedJobDescription: !!prep.jobDescription,
      content: doc as unknown as Prisma.InputJsonValue,
      sources: cited as unknown as Prisma.InputJsonValue,
      costMicros: cost._sum.costMicros ?? 0,
      createdAt: now,
    },
  });
  console.info(
    `[prep] doc made ${JSON.stringify({ searches: found.length, sources: cited.length, official: cited.filter((s) => s.official).length, ms: Date.now() - started })}`,
  );
  return saved;
}

/** The docs for one application, newest first. */
export const prepDocs = (user: ScheduleUser, applicationId: string) =>
  db().interviewPrepDoc.findMany({
    where: { userId: user.id, applicationId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, usedJobDescription: true },
  });

export async function prepDoc(user: ScheduleUser, id: string) {
  const row = await db().interviewPrepDoc.findFirst({
    where: { id, userId: user.id },
  });
  if (!row) return null;
  return {
    ...row,
    doc: row.content as unknown as PrepDoc,
    cited: row.sources as unknown as Source[],
  };
}

export async function deletePrepDoc(user: ScheduleUser, id: string) {
  const row = await db().interviewPrepDoc.findFirst({
    where: { id, userId: user.id },
    select: { id: true, applicationId: true },
  });
  if (!row) throw new Error('This doc was already deleted.');
  await db().interviewPrepDoc.delete({ where: { id: row.id } });
  return row.applicationId;
}

/** For Rumi (WI-042): the latest doc per application, as topics and the seven-day plan. */
export async function latestPrepDocs(user: ScheduleUser) {
  const rows = await db().interviewPrepDoc.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      applicationId: true,
      company: true,
      role: true,
      createdAt: true,
      content: true,
    },
  });
  const latest = [
    ...new Map(rows.map((r) => [r.applicationId, r])).values(),
  ].slice(0, 3);
  return {
    docs: latest.map((r) => {
      const d = r.content as unknown as PrepDoc;
      return {
        company: r.company,
        role: r.role,
        written: dayKey(r.createdAt, user.timezone),
        topics: d.topics.map((t) => ({
          name: t.name,
          yourItems: t.links.map((l) => l.title),
        })),
        plan: d.plan.map((p) => ({
          day: p.day,
          focus: p.focus,
          yourItems: p.links.map((l) => l.title),
        })),
      };
    }),
  };
}
