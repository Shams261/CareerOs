import { owner } from '@/server/db';
import { reviewPage } from '@/features/review/page-data';
import { ReviewHeader } from '@/features/review/steps/header';
import { WeekStep } from '@/features/review/steps/week-step';
import { ReflectStep } from '@/features/review/steps/reflect-step';
import { PlanStep } from '@/features/review/steps/plan-step';
import { DetailsStep } from '@/features/review/steps/details-step';
export const metadata = { title: 'Weekly review' };

/** The Weekly review (WI-024, redrawn in WI-097): the head, then the step asked for (WI-125). */
export default async function Review({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; step?: string }>;
}) {
  const v = await reviewPage(await owner(), await searchParams, new Date());
  return (
    <>
      <ReviewHeader v={v} />
      {v.step === 'week' && <WeekStep v={v} />}
      {v.step === 'reflect' && <ReflectStep v={v} />}
      {v.step === 'plan' && <PlanStep v={v} />}
      {v.step === 'details' && <DetailsStep v={v} />}
    </>
  );
}
