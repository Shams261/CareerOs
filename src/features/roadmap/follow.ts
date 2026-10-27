// Relative imports only: scripts/lib/roadmap-import.ts runs this outside Next.js.
import type { Prisma } from '../../generated/prisma/client';

type ItemStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

/**
 * A roadmap item linked to a Practice problem follows Practice (WI-046, ADR-025): no attempt
 * is Not started, any attempt In progress, Green Done. Revision lives on the problem only.
 */
export function practiceStatus(problem: {
  attemptsCount: number;
  confidence: 'RED' | 'YELLOW' | 'GREEN';
}): ItemStatus {
  if (!problem.attemptsCount) return 'NOT_STARTED';
  return problem.confidence === 'GREEN' ? 'DONE' : 'IN_PROGRESS';
}

/**
 * Brings the owner's problem-linked roadmap items in step with their problems, inside the
 * caller's transaction: status from `practiceStatus`, `completedAt` kept from the first time
 * Green, and no roadmap revision. Only items that differ are written. Never writes to Practice.
 */
export async function followPractice(
  tx: Prisma.TransactionClient,
  userId: string,
  where: { problemId?: string; itemId?: string } = {},
  now = new Date(),
) {
  const items = await tx.roadmapItem.findMany({
    where: {
      userId,
      dsaProblemId: where.problemId ?? { not: null },
      ...(where.itemId ? { id: where.itemId } : {}),
    },
    select: {
      id: true,
      status: true,
      completedAt: true,
      nextRevisionAt: true,
      revisionStage: true,
      dsaProblem: { select: { attemptsCount: true, confidence: true } },
    },
  });
  let changed = 0;
  for (const item of items) {
    if (!item.dsaProblem) continue;
    const status = practiceStatus(item.dsaProblem);
    const completedAt = status === 'DONE' ? (item.completedAt ?? now) : null;
    if (
      item.status === status &&
      +(item.completedAt ?? 0) === +(completedAt ?? 0) &&
      item.nextRevisionAt === null &&
      item.revisionStage === 0
    )
      continue;
    await tx.roadmapItem.update({
      where: { id: item.id },
      data: { status, completedAt, nextRevisionAt: null, revisionStage: 0 },
    });
    changed += 1;
  }
  return changed;
}
