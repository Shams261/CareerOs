import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { owner } from '@/server/db';
import { aiConfig } from '@/lib/env';
import { AGENT_NAME } from '@/features/agent/domain';
import { agentSetting } from '@/features/agent/memory-service';
import { readVoiceLang } from '@/features/agent/voice-domain';
import { mockFor } from '@/features/prep/mock';
import { MockInterview } from '@/features/prep/mock-ui';

export const metadata = { title: 'Mock interview' };

/** A mock interview from a prep doc (WI-108): the doc's questions, Rumi's feedback. */
export default async function MockPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const user = await owner();
  const { id, docId } = await params;
  const [mock, setting] = await Promise.all([
    mockFor(user, docId),
    agentSetting(user),
  ]);
  if (!mock || mock.applicationId !== id || !aiConfig()) notFound();
  return (
    <>
      <Link
        className="link"
        href={`/jobs/${id}/prep/${docId}`}
        prefetch={false}
      >
        <ArrowLeft size={14} aria-hidden="true" /> {mock.company} prep doc
      </Link>
      <p className="eyebrow mt-4">With {AGENT_NAME}</p>
      <div className="page-head">
        <h1>Mock interview · {mock.company}</h1>
      </div>
      <p className="today-summary">
        {mock.questions.length} questions from the prep doc · one paragraph of
        feedback each · no scores
      </p>
      {mock.questions.length ? (
        <MockInterview
          docId={docId}
          questions={mock.questions}
          voice={{
            consented: !!setting.voiceConsentAt,
            lang: readVoiceLang(setting.voiceLang),
            speakReplies: setting.speakReplies,
          }}
        />
      ) : (
        <p>This doc has no questions to practise from.</p>
      )}
    </>
  );
}
