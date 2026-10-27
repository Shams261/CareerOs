import Link from 'next/link';
import { Plus } from 'lucide-react';
import { owner } from '@/server/db';
import { shortDate, dayKey } from '@/lib/time';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { aiState } from '@/features/ai/service';
import { budgetLine } from '@/features/ai/domain';
import { AGENT_NAME } from '@/features/agent/domain';
import { conversation, conversations } from '@/features/agent/service';
import { RumiChat } from '@/features/agent/chat';

export const metadata = { title: `Ask ${AGENT_NAME}` };

function ConversationList({
  list,
  current,
  zone,
}: {
  list: { id: string; title: string; updatedAt: Date }[];
  current: string | null;
  zone: string;
}) {
  return (
    <>
      <Link className="button secondary small" href="/rumi" prefetch={false}>
        <Plus size={16} aria-hidden="true" /> New conversation
      </Link>
      {list.length ? (
        <ul className="plain-list rumi-conversations">
          {list.map((c) => (
            <li key={c.id}>
              <Link
                href={`/rumi?c=${c.id}`}
                prefetch={false}
                aria-current={c.id === current ? 'page' : undefined}
              >
                <span className="rumi-conversation-title">{c.title}</span>
                <span className="rumi-conversation-date">
                  {shortDate(dayKey(c.updatedAt, zone))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No conversations yet.</p>
      )}
    </>
  );
}

/**
 * Ask Rumi (WI-040, ADR-024): saved conversations with an assistant that reads the owner's
 * schedule, study, practice and jobs through read-only tools. It never changes anything.
 */
export default async function Rumi({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await owner();
  const { c } = await searchParams;
  const state = await aiState(user);
  if (!state.configured)
    return (
      <>
        <div className="page-head">
          <h1>Ask {AGENT_NAME}</h1>
        </div>
        <section className="card" aria-labelledby="rumi-off">
          <h2 id="rumi-off">{AGENT_NAME} is not set up on this server</h2>
          <p>
            {AGENT_NAME} needs the OpenRouter key on the server
            (OPENROUTER_API_KEY), the same one Grill Me uses.
          </p>
        </section>
      </>
    );
  const [list, open] = await Promise.all([
    conversations(user),
    c ? conversation(user, c) : null,
  ]);
  const current = open?.id ?? null;
  return (
    <>
      <header className="today-head">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Ask {AGENT_NAME}</h1>
          </div>
          <PanelButton
            panel="rumi-conversations"
            className="button secondary small rumi-list-button"
          >
            Conversations
          </PanelButton>
        </div>
        <p className="today-summary">
          {state.blocked
            ? `${AGENT_NAME} is off: ${state.blocked}. Check the provider again in Settings.`
            : `Reads your schedule, study, practice and jobs · never your notes · ${budgetLine(state.spent)}`}
        </p>
      </header>
      {c && !open && (
        <p className="form-message" role="status">
          This conversation no longer exists. Start a new one.
        </p>
      )}
      <div className="rumi-layout">
        <nav className="rumi-side" aria-label="Conversations">
          <ConversationList
            list={list}
            current={current}
            zone={user.timezone}
          />
        </nav>
        <RumiChat
          key={current ?? 'new'}
          conversationId={current}
          title={open?.title ?? null}
          initial={(open?.messages ?? []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          }))}
          budget={budgetLine(state.spent)}
        />
      </div>
      <SidePanel id="rumi-conversations" title="Conversations">
        <ConversationList list={list} current={current} zone={user.timezone} />
      </SidePanel>
    </>
  );
}
