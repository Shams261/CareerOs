import type { Prisma } from '../src/generated/prisma/client';
import { localInstant } from '../src/lib/time';
import { shiftDay } from '../src/features/schedule/domain';

/** Fictional pipeline examples for newly created seed owners only. URLs are example.com placeholders. */
export async function seedJobs(
  tx: Prisma.TransactionClient,
  userId: string,
  zone: string,
  day: string,
) {
  const at = (offset: number, time: string) =>
    localInstant(shiftDay(day, offset), time, zone);
  const date = (offset: number) => new Date(shiftDay(day, offset));
  const topic = (title: string) =>
    tx.learningTopic.findFirst({ where: { userId, title } });
  const activity = (
    applicationId: string,
    occurredAt: Date,
    data: Omit<
      Prisma.JobActivityUncheckedCreateInput,
      'userId' | 'applicationId' | 'occurredAt'
    >,
  ) =>
    tx.jobActivity.create({
      data: { userId, applicationId, occurredAt, ...data },
    });
  const notes = 'Fictional seed example for local development.';

  const amazon = await tx.jobApplication.create({
    data: {
      id: 'seed-job-amazon',
      userId,
      company: 'Amazon',
      role: 'Software Development Engineer II',
      jobUrl: 'https://example.com/jobs/amazon-sde-ii',
      location: 'Vancouver',
      workArrangement: 'HYBRID',
      employmentType: 'Full-time',
      source: 'LinkedIn',
      appliedAt: date(-12),
      stage: 'TECHNICAL',
      priority: 1,
      recruiterName: 'Jane Doe',
      recruiterContact: 'jane.doe@example.com',
      nextAction: 'Prepare System Design round',
      nextActionDate: date(2),
      actionOwner: 'ME',
      notes,
    },
  });
  await activity(amazon.id, at(-12, '20:00'), {
    type: 'CREATED',
    toStage: 'APPLIED',
  });
  await activity(amazon.id, at(-9, '11:00'), {
    type: 'STAGE_CHANGED',
    fromStage: 'APPLIED',
    toStage: 'RECRUITER_SCREEN',
    note: 'Recruiter reached out',
  });
  const screen = await tx.interviewRound.create({
    data: {
      userId,
      applicationId: amazon.id,
      title: 'Recruiter Screen',
      type: 'RECRUITER',
      scheduledStart: at(-8, '10:00'),
      scheduledEnd: at(-8, '10:30'),
      timezone: zone,
      status: 'COMPLETED',
      interviewers: 'Jane Doe',
      outcomeNotes: 'Role scope and timeline; moving to technical.',
      completedAt: at(-8, '10:35'),
    },
  });
  await activity(amazon.id, at(-8, '10:35'), {
    type: 'INTERVIEW_RESULT',
    interviewRoundId: screen.id,
    note: 'Recruiter Screen: completed',
  });
  await activity(amazon.id, at(-7, '09:00'), {
    type: 'STAGE_CHANGED',
    fromStage: 'RECRUITER_SCREEN',
    toStage: 'TECHNICAL',
  });
  const coding = await tx.interviewRound.create({
    data: {
      userId,
      applicationId: amazon.id,
      title: 'Coding Round',
      type: 'CODING',
      scheduledStart: at(-4, '14:00'),
      scheduledEnd: at(-4, '15:00'),
      timezone: zone,
      status: 'COMPLETED',
      topicsAsked: 'Sliding window; follow-up on transaction isolation.',
      wentWell: 'Clear complexity analysis.',
      toImprove: 'Explaining isolation levels with examples.',
      completedAt: at(-4, '15:05'),
    },
  });
  await activity(amazon.id, at(-4, '15:05'), {
    type: 'INTERVIEW_RESULT',
    interviewRoundId: coding.id,
    note: 'Coding Round: completed',
  });
  const isolation = await topic('Isolation Levels');
  await tx.interviewPrepItem.create({
    data: {
      userId,
      roundId: coding.id,
      kind: 'GAP',
      title: 'Explain PostgreSQL isolation levels',
      learningTopicId: isolation?.id ?? null,
    },
  });
  const design = await tx.interviewRound.create({
    data: {
      userId,
      applicationId: amazon.id,
      title: 'System Design',
      type: 'SYSTEM_DESIGN',
      scheduledStart: at(3, '14:00'),
      scheduledEnd: at(3, '15:00'),
      timezone: zone,
      interviewers: 'Senior engineer panel',
      meetingUrl: 'https://example.com/meet/amazon-design',
    },
  });
  await activity(amazon.id, at(-3, '12:00'), {
    type: 'INTERVIEW_SCHEDULED',
    interviewRoundId: design.id,
    newStart: design.scheduledStart,
    note: 'System Design',
  });
  const [caching, rateLimiting] = await Promise.all([
    topic('Caching'),
    topic('Rate Limiting'),
  ]);
  let ordering = 0;
  for (const [title, link] of [
    ['Review caching', caching?.id ?? null],
    ['Review rate limiting', rateLimiting?.id ?? null],
    ['Practice Design News Feed', null],
  ] as const)
    await tx.interviewPrepItem.create({
      data: {
        userId,
        roundId: design.id,
        title,
        learningTopicId: link,
        ordering: ordering++,
        completed: ordering === 1,
        completedAt: ordering === 1 ? at(-1, '21:00') : null,
      },
    });

  const shopify = await tx.jobApplication.create({
    data: {
      id: 'seed-job-shopify',
      userId,
      company: 'Shopify',
      role: 'Backend Developer',
      jobUrl: 'https://example.com/jobs/shopify-backend',
      location: 'Remote (Canada)',
      workArrangement: 'REMOTE',
      source: 'Company Website',
      appliedAt: date(-10),
      stage: 'RECRUITER_SCREEN',
      recruiterName: 'Sam Lee',
      nextAction: 'Follow up if no reply',
      nextActionDate: date(3),
      actionOwner: 'COMPANY',
      notes,
    },
  });
  await activity(shopify.id, at(-10, '19:30'), {
    type: 'CREATED',
    toStage: 'APPLIED',
  });
  await activity(shopify.id, at(-6, '13:00'), {
    type: 'STAGE_CHANGED',
    fromStage: 'APPLIED',
    toStage: 'RECRUITER_SCREEN',
  });
  const shopifyScreen = await tx.interviewRound.create({
    data: {
      userId,
      applicationId: shopify.id,
      title: 'Recruiter Screen',
      type: 'RECRUITER',
      scheduledStart: at(-5, '11:00'),
      scheduledEnd: at(-5, '11:30'),
      timezone: zone,
      status: 'COMPLETED',
      interviewers: 'Sam Lee',
      completedAt: at(-5, '11:35'),
    },
  });
  await activity(shopify.id, at(-5, '11:35'), {
    type: 'INTERVIEW_RESULT',
    interviewRoundId: shopifyScreen.id,
    note: 'Recruiter Screen: completed',
  });

  const companyX = await tx.jobApplication.create({
    data: {
      id: 'seed-job-company-x',
      userId,
      company: 'Company X',
      role: 'Full Stack Developer',
      source: 'Referral',
      appliedAt: date(-7),
      stage: 'APPLIED',
      nextAction: 'Follow up with recruiter',
      nextActionDate: date(0),
      actionOwner: 'ME',
      notes,
    },
  });
  await activity(companyX.id, at(-7, '21:00'), {
    type: 'CREATED',
    toStage: 'APPLIED',
  });

  const previous = await tx.jobApplication.create({
    data: {
      id: 'seed-job-previous',
      userId,
      company: 'Northwind Systems',
      role: 'Backend Engineer',
      source: 'Indeed',
      appliedAt: date(-30),
      stage: 'REJECTED',
      notes,
    },
  });
  await activity(previous.id, at(-30, '20:00'), {
    type: 'CREATED',
    toStage: 'APPLIED',
  });
  await activity(previous.id, at(-18, '10:00'), {
    type: 'STAGE_CHANGED',
    fromStage: 'APPLIED',
    toStage: 'REJECTED',
    note: 'Position filled',
  });
}
