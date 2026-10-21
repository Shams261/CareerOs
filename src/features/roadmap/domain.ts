import { z } from 'zod';
import { dateInput } from '@/features/schedule/domain';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const goalInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  description: text(1000),
  targetDate: z
    .union([z.literal(''), dateInput])
    .optional()
    .transform((v) => v || null),
  status: z
    .enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'])
    .default('ACTIVE'),
  priority: z.coerce.number().int().min(1).max(3).default(2),
});
export type GoalInput = z.infer<typeof goalInput>;

export const roadmapInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(160),
  description: text(1000),
  goalId: z
    .string()
    .optional()
    .transform((v) => v || null),
  archived: z.boolean().default(false),
});

export const itemKinds = ['CONCEPT', 'QUESTION'] as const;
export const itemStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const;
export type ItemStatus = (typeof itemStatuses)[number];

export const bulkItemsInput = z.object({
  roadmapId: z.string().min(1),
  section: z.string().trim().min(1).max(120),
  lines: z.string().min(1).max(20000),
});

/** `link` is `learning:<id>`, `dsa-topic:<id>`, `problem:<id>` or empty. */
export const itemInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  section: z.string().trim().min(1).max(120),
  kind: z.enum(itemKinds),
  notes: text(2000),
  url: z
    .union([z.literal(''), z.url({ protocol: /^https?$/ })])
    .optional()
    .transform((v) => v || null),
  askedNote: text(200),
  link: z
    .string()
    .regex(/^(|learning:[\w-]+|dsa-topic:[\w-]+|problem:[\w-]+)$/)
    .default(''),
});

export const itemOps = [
  'start',
  'done',
  'reopen',
  'asked',
  'unasked',
  'remove',
] as const;
export type ItemOp = (typeof itemOps)[number];

/**
 * One item per non-empty line. A leading `?` (or a trailing `?`) marks a question.
 * Leading list markers (`- `, `* `, `1. `) are stripped so a pasted outline works as is.
 */
export function parseBulkLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const question = line.startsWith('?') || line.endsWith('?');
      return {
        title: line.replace(/^\?\s*/, '').slice(0, 200),
        kind: question ? ('QUESTION' as const) : ('CONCEPT' as const),
      };
    });
}

export function nextStatus(op: ItemOp, current: ItemStatus): ItemStatus {
  if (op === 'start') return current === 'DONE' ? 'DONE' : 'IN_PROGRESS';
  if (op === 'done') return 'DONE';
  if (op === 'reopen') return 'IN_PROGRESS';
  return current;
}

export type ProgressItem = { status: ItemStatus; askedInInterview: boolean };
/** Counts only; no percentage score is shown to the owner. */
export function roadmapProgress(items: ProgressItem[]) {
  return {
    total: items.length,
    done: items.filter((i) => i.status === 'DONE').length,
    inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
    asked: items.filter((i) => i.askedInInterview).length,
  };
}

/** Days until a target date, in whole calendar days of the owner's zone. */
export function daysUntil(target: string, today: string) {
  return Math.round(
    (+new Date(`${target}T12:00:00Z`) - +new Date(`${today}T12:00:00Z`)) /
      86400000,
  );
}

export function targetLabel(target: string | null, today: string) {
  if (!target) return 'No target date';
  const days = daysUntil(target, today);
  if (days < 0)
    return `Target passed ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return 'Target is today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} left`;
  return `${Math.round(days / 7)} weeks left`;
}
