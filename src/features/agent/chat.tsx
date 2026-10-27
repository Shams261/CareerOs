'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { askAction, deleteConversationAction } from './actions';
import { ASK_EVENT, ASK_KEY } from './events';
import { ProposalCard, SuggestionCard } from './cards';
import type { Proposal, Suggestion } from './plan-domain';
import {
  AGENT_NAME,
  MESSAGE_MAX,
  renderText,
  SUGGESTED_PROMPTS,
} from './domain';

type Message = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  proposals?: Proposal[];
  suggestions?: Suggestion[];
};

/** The model's text as paragraphs, lists and bold, rendered as text only (`renderText`). */
export function RumiText({ text }: { text: string }) {
  return (
    <>
      {renderText(text).map((block, i) => {
        const line = (spans: { text: string; bold: boolean }[]) =>
          spans.map((s, j) =>
            s.bold ? <strong key={j}>{s.text}</strong> : s.text,
          );
        if (block.type === 'p') return <p key={i}>{line(block.spans)}</p>;
        const List = block.type;
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{line(item)}</li>
            ))}
          </List>
        );
      })}
    </>
  );
}

/**
 * Ask Rumi (WI-040): the conversation, the composer and the suggested questions. Every send
 * is one server action; the answer is stored with the conversation and shown here. The page
 * keys this by conversation, so choosing another one starts it afresh.
 */
export function RumiChat({
  conversationId,
  title,
  initial,
  budget: initialBudget,
  today,
}: {
  conversationId: string | null;
  title: string | null;
  initial: Message[];
  budget: string;
  /** The owner's today, so a plan for today reads "Today". */
  today: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [current, setCurrent] = useState(conversationId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState(initialBudget);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A refresh (after Add to plan, or Undo) brings the stored cards; keep any question in flight.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial && !pending) {
    setSeenInitial(initial);
    setMessages(initial);
  }
  const end = useRef<HTMLDivElement>(null);

  const send = (raw: string) => {
    const question = raw.trim();
    if (!question || pending) return;
    setError(null);
    setText('');
    const local: Message = {
      id: `local-${Date.now()}`,
      role: 'USER',
      content: question,
    };
    setMessages((m) => [...m, local]);
    start(async () => {
      const result = await askAction(current, question);
      if (result.budget) setBudget(result.budget);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessages((m) => [...m, { ...result.reply, role: 'ASSISTANT' }]);
      if (result.conversationId !== current) {
        setCurrent(result.conversationId);
        router.replace(`/rumi?c=${result.conversationId}`, { scroll: false });
      }
      router.refresh();
    });
  };

  // "Ask Rumi · …" from the command bar: on arrival, or while already here.
  useEffect(() => {
    const take = () => {
      let q: string | null = null;
      try {
        q = sessionStorage.getItem(ASK_KEY);
        sessionStorage.removeItem(ASK_KEY);
      } catch {
        q = null;
      }
      if (q) send(q);
    };
    take();
    window.addEventListener(ASK_EVENT, take);
    return () => window.removeEventListener(ASK_EVENT, take);
    // `send` reads the latest state through the transition; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, pending]);

  return (
    <section className="rumi-chat" aria-label={title ?? `Ask ${AGENT_NAME}`}>
      {current && (
        <div className="rumi-chat-head">
          <h2 className="rumi-chat-title">{title ?? 'New conversation'}</h2>
          {confirmDelete ? (
            <ActionForm
              action={deleteConversationAction}
              className="rumi-confirm"
              onSuccess={() => router.replace('/rumi')}
            >
              <input type="hidden" name="id" value={current} />
              <span>Delete this conversation?</span>
              <Button className="destructive small">Delete</Button>
              <button
                type="button"
                className="link"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </button>
            </ActionForm>
          ) : (
            <button
              type="button"
              className="link"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      )}
      <div className="rumi-log" aria-live="polite">
        {messages.length === 0 && (
          <div className="rumi-empty">
            <p className="rumi-empty-lead">
              {AGENT_NAME} reads your schedule, study, practice and jobs, and
              answers from them. It never sees your notes.
            </p>
            <ul className="rumi-prompts" aria-label="Suggested questions">
              {SUGGESTED_PROMPTS.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className="rumi-prompt"
                    onClick={() => send(p)}
                    disabled={pending}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <article
            key={m.id}
            className="rumi-message"
            data-role={m.role === 'USER' ? 'owner' : 'rumi'}
          >
            <p className="rumi-who">{m.role === 'USER' ? 'You' : AGENT_NAME}</p>
            {m.role === 'USER' ? (
              <p className="rumi-own">{m.content}</p>
            ) : (
              <div className="rumi-reply">
                <RumiText text={m.content} />
                {m.proposals?.map((p) => (
                  <ProposalCard
                    key={p.id}
                    messageId={m.id}
                    proposal={p}
                    today={today}
                  />
                ))}
                {m.suggestions?.map((x) => (
                  <SuggestionCard key={x.id} messageId={m.id} suggestion={x} />
                ))}
              </div>
            )}
          </article>
        ))}
        {pending && (
          <p className="rumi-reading" role="status">
            {AGENT_NAME} is reading your records…
          </p>
        )}
        {error && (
          <p className="form-message rumi-error" role="alert">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="rumi-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="rumi-input" className="sr-only">
          Ask {AGENT_NAME}
        </label>
        <textarea
          id="rumi-input"
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder={`Ask ${AGENT_NAME} about your week, roadmap or interviews`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <button
          type="submit"
          className="button rumi-send"
          disabled={pending || !text.trim()}
          aria-label="Send"
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </form>
      <p className="rumi-budget">
        {budget} · answers from your own records, on a zero-retention endpoint
      </p>
    </section>
  );
}
