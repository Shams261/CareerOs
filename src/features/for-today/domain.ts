/**
 * "For today" (WI-059): at most three things to study, each with the fact that makes it the
 * pick. Pure and deterministic, from records the pages already load; no AI, no writes.
 * Covered by tests/for-today-domain.test.ts.
 */
import { dateLabel, revisionContext } from '@/features/attention/domain';
import { shortDate } from '@/lib/time';

export type TodayPick = {
  key: string;
  kind: 'revise' | 'study' | 'problem';
  title: string;
  /** Why this one, in facts: "Revision overdue by 2 days · Red". */
  reason: string;
  href: string;
  /** The block category a "Start 20 min" on this pick records as. */
  category: string;
};

type DueProblem = {
  id: string;
  title: string;
  confidence: string;
  nextRevisionAt: Date | null;
};
type DueItem = {
  id: string;
  title: string;
  section: string;
  nextRevisionAt: Date | null;
  roadmap: { id: string; title: string };
};
type StudyItem = {
  id: string;
  title: string;
  section: string;
  roadmapId: string;
  roadmapTitle: string;
  priority?: number;
  dsaProblemId?: string | null;
};

export type ForTodayInput = {
  today: string;
  /** Practice revisions due, in `revisionQueue` order. */
  problemsDue: DueProblem[];
  /** Roadmap revisions due, in `revisionQueue` order. */
  itemsDue: DueItem[];
  /** This week's rows for interviews in the next two weeks, nearest first. */
  interviewRows: {
    label: string;
    format: string;
    done: number;
    target: number;
    next: StudyItem | null;
    interview: { company: string; on: string } | null;
  }[];
  /** The overview's Continue item, when there is one. */
  continueItem: StudyItem | null;
  /** Every practice problem, in the Practice page's order. */
  problems: {
    id: string;
    title: string;
    confidence: string;
    attemptsCount: number;
    topicId: string;
    topic: { name: string };
  }[];
  currentTopicId: string | null;
};

export const FOR_TODAY = 3;
/** Start on a pick runs a short session; Focus shows it as the target. */
export const PICK_MINUTES = 20;
/** Categories a pick records as. */
export const PICK_CATEGORIES = ['DSA', 'TECHNICAL'] as const;
const word = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const itemHref = (i: { roadmapId: string; section: string; id: string }) =>
  `/roadmap/${i.roadmapId}?section=${encodeURIComponent(i.section)}#item-${i.id}`;

/**
 * Three picks, in this order:
 * 1. The oldest revision due, from Practice or the roadmap.
 * 2. The next item for an interview in the next two weeks, or the overview's Continue item.
 * 3. One practice problem: Red from last time first, then the current topic's next untried,
 *    then any untried.
 * A pick that would repeat an earlier one (same problem or item) is skipped.
 */
export function forToday(input: ForTodayInput): TodayPick[] {
  const picks: TodayPick[] = [];
  const taken = new Set<string>();
  const add = (p: TodayPick, ids: string[]) => {
    if (ids.some((id) => taken.has(id))) return false;
    ids.forEach((id) => taken.add(id));
    picks.push(p);
    return true;
  };

  // 1. The oldest revision due; on the same day a problem goes first.
  const problem = input.problemsDue[0];
  const item = input.itemsDue[0];
  const problemFirst =
    !!problem &&
    (!item || +(problem.nextRevisionAt ?? 0) <= +(item.nextRevisionAt ?? 0));
  if (problemFirst && problem?.nextRevisionAt)
    add(
      {
        key: `revise:problem:${problem.id}`,
        kind: 'revise',
        title: `Revise ${problem.title}`,
        reason: `${revisionContext(dateLabel(problem.nextRevisionAt), input.today)} · ${word(problem.confidence)}`,
        href: `/dsa/${problem.id}`,
        category: 'DSA',
      },
      [problem.id],
    );
  else if (item?.nextRevisionAt)
    add(
      {
        key: `revise:item:${item.id}`,
        kind: 'revise',
        title: `Revise ${item.title}`,
        reason: `${revisionContext(dateLabel(item.nextRevisionAt), input.today)} · ${item.roadmap.title}`,
        href: itemHref({ ...item, roadmapId: item.roadmap.id }),
        category: 'TECHNICAL',
      },
      [item.id],
    );

  // 2. What the nearest interview tests, else where the roadmap continues.
  const row = input.interviewRows.find(
    (r) => r.interview && r.next && r.done < r.target,
  );
  const study = row?.next ?? input.continueItem;
  if (study) {
    const coding = row?.format === 'CODING' || !!study.dsaProblemId;
    add(
      {
        key: `study:${study.id}`,
        kind: 'study',
        title: study.title,
        reason:
          row?.interview && row.next
            ? `${row.interview.company} ${row.label.toLowerCase()} on ${shortDate(row.interview.on)}${study.priority === 1 ? ' · P0' : ''}`
            : `Next in ${study.roadmapTitle}${study.priority === 1 ? ' · P0' : ''}`,
        href: study.dsaProblemId
          ? `/dsa/${study.dsaProblemId}?from=${study.id}`
          : itemHref(study),
        category: coding ? 'DSA' : 'TECHNICAL',
      },
      [study.id, ...(study.dsaProblemId ? [study.dsaProblemId] : [])],
    );
  }

  // 3. One problem: Red from last time, then the current topic, then anything untried.
  const free = input.problems.filter((p) => !taken.has(p.id));
  const red = free.find((p) => p.attemptsCount > 0 && p.confidence === 'RED');
  const current = free.find(
    (p) => p.topicId === input.currentTopicId && !p.attemptsCount,
  );
  const untried = free.find((p) => !p.attemptsCount);
  const next = red ?? current ?? untried;
  if (next)
    add(
      {
        key: `problem:${next.id}`,
        kind: 'problem',
        title: next.title,
        reason:
          next === red
            ? `Shaky last time · ${next.topic.name}`
            : next === current
              ? `Current topic ${next.topic.name} · not tried yet`
              : `${next.topic.name} · not tried yet`,
        href: `/dsa/${next.id}`,
        category: 'DSA',
      },
      [next.id],
    );

  return picks.slice(0, FOR_TODAY);
}
