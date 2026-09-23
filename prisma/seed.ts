import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { addDays } from 'date-fns';
import { dayKey, localInstant } from '../src/lib/time';
import { resourceUrl } from '../src/lib/validation';
import { routineOccurrence, shiftDay } from '../src/features/schedule/domain';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  const email = process.env.OWNER_EMAIL;
  if (!email) throw new Error('OWNER_EMAIL is required');
  const zone = 'America/Toronto',
    day = dayKey(new Date(), zone),
    at = (time: string) => localInstant(day, time, zone);
  await prisma.$transaction(
    async (tx) => {
      const newOwner = !(await tx.user.findUnique({ where: { email } }));
      const user = await tx.user.upsert({
        where: { email },
        create: { email, name: 'Alex Morgan', timezone: zone },
        update: {},
      });
      for (const [id, title, category] of [
        ['job', 'Job Switch', 'Career'],
        ['dsa', 'DSA Interview Readiness', 'Study'],
        ['gym', 'Gym Consistency', 'Fitness'],
        ['language', 'Language Exam Preparation', 'Custom learning'],
      ])
        await tx.goal.upsert({
          where: { id: `seed-${id}` },
          create: { id: `seed-${id}`, userId: user.id, title, category },
          update: {},
        });
      const topic = await tx.dsaTopic.upsert({
        where: { name: 'Sliding Window' },
        create: { name: 'Sliding Window', status: 'LEARNING', ordering: 3 },
        update: {},
      });
      await tx.dsaProblem.upsert({
        where: { id: 'seed-problem' },
        create: {
          id: 'seed-problem',
          userId: user.id,
          title: 'Longest Substring Without Repeating Characters',
          platform: 'LeetCode',
          problemUrl: resourceUrl.parse(
            'https://leetcode.com/problems/longest-substring-without-repeating-characters/',
          ),
          topicId: topic.id,
          difficulty: 'MEDIUM',
          confidence: 'YELLOW',
          lastAttemptedAt: at('08:45'),
          nextRevisionAt: addDays(at('07:30'), 2),
          attemptsCount: 2,
          notes:
            'Practice moving the left boundary without revisiting characters.',
        },
        update: {},
      });
      for (const [id, title, url] of [
        ['typescript', 'TypeScript', 'https://www.typescriptlang.org/docs/'],
        [
          'system-design',
          'System Design',
          'https://www.hellointerview.com/learn/system-design/in-a-hurry/introduction',
        ],
        ['postgres', 'PostgreSQL', 'https://www.postgresql.org/docs/'],
      ]) {
        await tx.learningTopic.upsert({
          where: { id: `seed-${id}` },
          create: {
            id: `seed-${id}`,
            userId: user.id,
            title,
            status: 'LEARNING',
          },
          update: {},
        });
        await tx.resource.upsert({
          where: { id: `seed-resource-${id}` },
          create: {
            id: `seed-resource-${id}`,
            userId: user.id,
            title: `${title} reference`,
            url: resourceUrl.parse(url),
            type: 'DOCUMENTATION',
            learningTopicId: `seed-${id}`,
          },
          update: {},
        });
      }
      await tx.jobApplication.upsert({
        where: { id: 'seed-job-application' },
        create: {
          id: 'seed-job-application',
          userId: user.id,
          company: 'Example Labs (demo)',
          role: 'Software Engineer',
          jobUrl: 'https://example.com/careers',
          location: 'Toronto / Remote',
          stage: 'APPLIED',
          appliedAt: at('12:00'),
          nextAction: 'Check application status',
          nextActionAt: addDays(at('12:00'), 5),
          notes: 'Fictional application; example.com is a seed placeholder.',
        },
        update: {},
      });
      const weekly: Array<
        [string, number[], string, string, string, string, string | null]
      > = [
        [
          'routine-dsa-weekdays',
          [1, 2, 3, 4],
          '07:30',
          '09:00',
          'DSA',
          'DSA',
          'seed-dsa',
        ],
        [
          'routine-work-weekdays',
          [1, 2, 3, 4, 5],
          '10:30',
          '19:00',
          'Work',
          'WORK',
          null,
        ],
        [
          'routine-gym',
          [1, 2, 4, 6],
          '19:30',
          '20:30',
          'Gym',
          'GYM',
          'seed-gym',
        ],
        [
          'routine-typescript',
          [1],
          '21:00',
          '22:00',
          'TypeScript',
          'TECHNICAL',
          null,
        ],
        [
          'routine-design',
          [2, 4],
          '21:00',
          '22:15',
          'System Design',
          'SYSTEM_DESIGN',
          null,
        ],
        [
          'routine-backend',
          [3],
          '21:00',
          '22:00',
          'Backend / Database',
          'TECHNICAL',
          null,
        ],
        [
          'routine-friday-dsa',
          [5],
          '07:30',
          '09:00',
          'DSA Revision',
          'DSA',
          'seed-dsa',
        ],
        [
          'routine-friday-jobs',
          [5],
          '21:00',
          '22:00',
          'Applications / Weekly Catch-up',
          'JOB_SEARCH',
          'seed-job',
        ],
        [
          'routine-saturday-dsa',
          [6],
          '09:00',
          '11:00',
          'DSA Deep Work',
          'DSA',
          'seed-dsa',
        ],
        [
          'routine-saturday-design',
          [6],
          '13:00',
          '14:30',
          'System Design',
          'SYSTEM_DESIGN',
          null,
        ],
        [
          'routine-sunday-mock',
          [0],
          '10:00',
          '11:30',
          'DSA Mock',
          'DSA',
          'seed-dsa',
        ],
        [
          'routine-sunday-jobs',
          [0],
          '14:00',
          '16:00',
          'Job Applications',
          'JOB_SEARCH',
          'seed-job',
        ],
        [
          'routine-sunday-review',
          [0],
          '18:00',
          '18:30',
          'Weekly Review',
          'PERSONAL',
          null,
        ],
      ];
      // Existing owners may have customized or deleted defaults. Seed routines only
      // when the owner is first created; never recreate removed examples on rerun.
      if (newOwner)
        for (const [
          id,
          weekdays,
          startLocal,
          endLocal,
          title,
          category,
          goalId,
        ] of weekly)
          await tx.routineBlock.create({
            data: {
              id,
              userId: user.id,
              weekdays,
              startLocal,
              endLocal,
              title,
              category,
              goalId,
            },
          });
      const routines = await tx.routineBlock.findMany({
        where: { userId: user.id, enabled: true },
      });
      for (let index = 0; index < 7; index++) {
        const date = shiftDay(day, index);
        const plan = await tx.dailyPlan.upsert({
          where: { userId_date: { userId: user.id, date: new Date(date) } },
          create: { userId: user.id, date: new Date(date) },
          update: {},
        });
        if (plan.generatedAt) continue;
        for (const r of routines) {
          const occurrence = routineOccurrence(r, date, zone);
          if (!occurrence) continue;
          await tx.timeBlock.upsert({
            where: {
              routineKey_occurrenceDate: {
                routineKey: r.id,
                occurrenceDate: new Date(date),
              },
            },
            create: {
              dailyPlanId: plan.id,
              routineKey: r.id,
              occurrenceDate: new Date(date),
              title: r.title,
              category: r.category,
              goalId: r.goalId,
              priority: r.priority,
              description: r.description,
              ...occurrence,
            },
            update: {},
          });
        }
        await tx.dailyPlan.update({
          where: { id: plan.id },
          data: { generatedAt: new Date() },
        });
      }
      for (const type of [
        'DAILY_PROGRESS',
        'MISSED_CHECK_IN',
        'UPCOMING_BLOCK',
        'OVERDUE_TASK',
        'JOB_FOLLOW_UP',
        'INTERVIEW',
        'DSA_REVISION',
      ] as const)
        await tx.notificationPreference.upsert({
          where: { userId_type: { userId: user.id, type } },
          create: {
            userId: user.id,
            type,
            timezone: zone,
            preferredTime: type === 'MISSED_CHECK_IN' ? '22:30' : '21:30',
          },
          update: {},
        });
    },
    { timeout: 20000 },
  );
  console.log(
    'Seed complete. Existing records were preserved. Example data is for development only.',
  );
}
main().finally(() => prisma.$disconnect());
