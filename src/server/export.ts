import 'server-only';
import { db } from './db';

export const EXPORT_VERSION = 1;
/**
 * Owner data export (JSON). Contains CareerOS domain records only. Never included: encrypted
 * Google tokens, sync tokens, watch-channel secrets, push subscription keys, sessions, the
 * maintenance ledger, or calendar sync internals. Backups remain the recovery mechanism.
 */
export async function exportOwnerData(userId: string, now = new Date()) {
  const own = { where: { userId } };
  const blockOmit = {
    calendarEtag: true,
    calendarSyncedHash: true,
    calendarSyncError: true,
    calendarSyncAttempts: true,
    calendarRetryAt: true,
  } as const;
  const [
    user,
    goals,
    routines,
    plans,
    sessions,
    checkIns,
    problems,
    attempts,
    subjects,
    topics,
    activities,
    resources,
    jobs,
    rounds,
    prep,
    jobActivities,
    reviews,
    preferences,
    notifications,
    calendar,
    roadmaps,
    quickNotes,
    studyNudges,
    revisionCards,
    aiSetting,
    aiUsage,
    agentConversations,
    agentMemories,
    prepDocs,
    noticedAnswers,
  ] = await Promise.all([
    db().user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        createdAt: true,
        dayPrint: true,
      },
    }),
    db().goal.findMany(own),
    db().routineBlock.findMany(own),
    db().dailyPlan.findMany({
      ...own,
      include: { blocks: { omit: blockOmit } },
      orderBy: { date: 'asc' },
    }),
    db().actualSession.findMany(own),
    db().dailyCheckIn.findMany(own),
    db().dsaProblem.findMany({
      ...own,
      include: { topic: { select: { name: true } } },
    }),
    db().dsaAttempt.findMany(own),
    db().learningSubject.findMany(own),
    db().learningTopic.findMany(own),
    db().learningActivity.findMany(own),
    db().resource.findMany(own),
    db().jobApplication.findMany(own),
    db().interviewRound.findMany(own),
    db().interviewPrepItem.findMany(own),
    db().jobActivity.findMany(own),
    db().weeklyReview.findMany({ ...own, include: { priorities: true } }),
    db().notificationPreference.findMany(own),
    db().notificationLog.findMany({
      ...own,
      select: {
        type: true,
        title: true,
        scheduledFor: true,
        sentAt: true,
        readAt: true,
        openedAt: true,
        feedback: true,
        createdAt: true,
      },
    }),
    db().calendarConnection.findUnique({
      where: { userId },
      select: {
        status: true,
        calendarName: true,
        accountEmail: true,
        excludedCategories: true,
        lastSuccessfulSyncAt: true,
      },
    }),
    db().roadmap.findMany({ ...own, include: { items: true } }),
    db().quickNote.findMany(own),
    db().studyNudgeSetting.findUnique({ where: { userId } }),
    db().revisionCard.findMany(own),
    db().aiSetting.findUnique({ where: { userId } }),
    // The ledger holds no prompt or answer: model, endpoint, tokens, cost and time only.
    db().aiUsage.findMany(own),
    // Ask Rumi (WI-040): the owner's conversations and "Rumi knows" lines.
    db().agentConversation.findMany({
      ...own,
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    db().agentMemory.findMany(own),
    // WI-042: prep docs with their cited sources.
    db().interviewPrepDoc.findMany({ ...own, orderBy: { createdAt: 'asc' } }),
    // WI-043: answers to "Rumi noticed" cards (kind, acted or dismissed).
    db().noticedAnswer.findMany(own),
  ]);
  return {
    format: 'careeros-export',
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    note: 'Instants are UTC ISO strings; calendar dates (DATE columns) are YYYY-MM-DD at 00:00Z.',
    user,
    goals,
    roadmaps,
    quickNotes,
    routines,
    dailyPlans: plans,
    actualSessions: sessions,
    dailyCheckIns: checkIns,
    dsa: { problems, attempts },
    learning: {
      subjects,
      topics,
      activities,
      resources: resources.filter((r) => r.learningTopicId),
    },
    jobs: {
      applications: jobs,
      rounds,
      prepItems: prep,
      activities: jobActivities,
      resources: resources.filter((r) => r.jobApplicationId),
      prepDocs,
    },
    otherResources: resources.filter(
      (r) => !r.learningTopicId && !r.jobApplicationId,
    ),
    weeklyReviews: reviews,
    notificationPreferences: preferences,
    studyNudges,
    revisionCards,
    ai: { setting: aiSetting, usage: aiUsage },
    rumi: {
      conversations: agentConversations,
      knows: agentMemories,
      noticed: noticedAnswers,
    },
    notifications,
    googleCalendar: calendar,
  };
}
