import type { Prisma } from '../src/generated/prisma/client';
import { assess, type Mastery } from '../src/features/learning/domain';
import { localInstant } from '../src/lib/time';
import { shiftDay } from '../src/features/schedule/domain';
export async function seedLearning(
  tx: Prisma.TransactionClient,
  userId: string,
  zone: string,
  day: string,
) {
  const examples = [
    [
      'TypeScript',
      [
        'Type System',
        'Narrowing',
        'Generics',
        'Utility Types',
        'Mapped Types',
        'Conditional Types',
        'unknown / any / never',
      ],
    ],
    ['Node.js', ['Event Loop', 'Streams', 'Error Handling', 'Worker Threads']],
    ['PostgreSQL', ['Indexes', 'Transactions', 'Isolation Levels', 'EXPLAIN']],
    [
      'System Design',
      ['Caching', 'Load Balancing', 'Message Queues', 'Rate Limiting'],
    ],
  ] as const;
  let ordering = 0;
  for (const [name, titles] of examples) {
    const subject = await tx.learningSubject.create({
      data: { userId, name, status: 'ACTIVE', ordering: ordering++ },
    });
    if (name === 'TypeScript')
      await tx.user.update({
        where: { id: userId },
        data: { currentSubjectId: subject.id },
      });
    let topicOrder = 0;
    for (const title of titles) {
      const topic = await tx.learningTopic.create({
        data: { userId, subjectId: subject.id, title, ordering: topicOrder++ },
      });
      const histories: {
        offset: number;
        scores: Partial<Mastery>;
        note: string;
      }[] =
        title === 'Generics'
          ? [
              {
                offset: -7,
                scores: { understanding: 2 },
                note: 'Explored generic functions.',
              },
              {
                offset: -3,
                scores: {
                  understanding: 3,
                  recall: 2,
                  application: 2,
                  interview: 1,
                },
                note: 'Need practice explaining generic constraints.',
              },
            ]
          : title === 'Narrowing'
            ? [
                {
                  offset: -5,
                  scores: {
                    understanding: 3,
                    recall: 3,
                    application: 3,
                    interview: 3,
                  },
                  note: 'Explained discriminated unions and implemented guards.',
                },
              ]
            : title === 'Utility Types'
              ? [
                  {
                    offset: -2,
                    scores: { understanding: 2 },
                    note: 'Learning Pick and Omit.',
                  },
                ]
              : title === 'Event Loop'
                ? [
                    {
                      offset: -6,
                      scores: { understanding: 3, recall: 1 },
                      note: 'Microtask ordering was difficult to recall.',
                    },
                  ]
                : [];
      let state = topic;
      for (const [index, h] of histories.entries()) {
        const performedAt = localInstant(
            shiftDay(day, h.offset),
            '20:00',
            zone,
          ),
          summary = assess(state, h.scores, shiftDay(day, h.offset));
        await tx.learningActivity.create({
          data: {
            userId,
            topicId: topic.id,
            requestId: `seed-${topic.id}-${index}`,
            activityType: index ? 'REVIEW' : 'LEARN',
            performedAt,
            ...h.scores,
            notes: h.note,
            statusBefore: state.status,
            statusAfter: summary.status,
          },
        });
        state = await tx.learningTopic.update({
          where: { id: topic.id },
          data: { ...summary, lastReviewedAt: performedAt },
        });
      }
      if (title === 'Generics')
        await tx.resource.create({
          data: {
            userId,
            learningTopicId: topic.id,
            title: 'TypeScript Generics Handbook',
            url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
            type: 'DOCUMENTATION',
          },
        });
    }
  }
  await tx.notificationPreference.create({
    data: {
      userId,
      type: 'TECHNICAL_REVIEW',
      preferredTime: '18:00',
      timezone: zone,
    },
  });
}
