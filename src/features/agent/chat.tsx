'use client';
import { pageRef, promptsFor } from './page-domain';
import { RumiPose } from './pose';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { deleteConversationAction, type AskResult } from './actions';
import { ASK_EVENT, ASK_KEY, PREFILL_EVENT, PREFILL_KEY } from './events';
import {
  ActionRows,
  KeptRows,
  ProposalCard,
  RequestCard,
  SuggestionCard,
} from './cards';
import type { CardView } from './request-domain';
import {
  MicButton,
  StopReading,
  useCanDictate,
  useComposerVoice,
  useReplyVoice,
  useVoiceState,
  type VoiceState,
} from './voice';
import { voiceMeta, type VoiceMeta } from './voice-domain';
import type { WriteAction } from './write-domain';
import { WRITE_WORDS, isWrite } from '@/features/agent/text';
import type { Kept, Proposal, Suggestion } from './plan-domain';
import { MESSAGE_MAX } from '@/features/agent/constants';
import { readingLine, readLine, renderText } from '@/features/agent/text';
import { AGENT_NAME } from '@/features/agent/constants';
import { RumiMark } from './mark';

type Message = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  proposals?: Proposal[];
  suggestions?: Suggestion[];
  /** Lines Rumi kept after this answer (WI-100). */
  kept?: Kept[];
  /** Changes Rumi made in this answer (WI-102). */
  actions?: WriteAction[];
  /** Cards Rumi made for the owner to apply (WI-103). */
  requests?: CardView[];
  /** The reads behind an answer, for its "Read:" line (WI-055). */
  tools?: string[];
};

/**
 * Sends one question to the streaming route and calls `onRead` as each read starts; resolves
 * with the same result the server action gives (WI-055) as soon as it arrives, and keeps
 * reading for the lines Rumi kept after it (WI-100), handed to `onKept`.
 */
function askStreaming(
  conversationId: string | null,
  text: string,
  onRead: (tool: string) => void,
  onKept: (messageId: string, items: Kept[]) => void,
  voice: VoiceMeta | null = null,
  /** WI-117: the page Rumi was opened on; the server reads its record. */
  page: string | null = null,
  /** WI-119: the answer's text as it is written, or a reset when a round turns to tools. */
  onText: (e: { delta?: string; reset?: boolean }) => void = () => {},
): Promise<AskResult> {
  const failed: AskResult = {
    ok: false,
    message: `${AGENT_NAME} couldn’t answer right now. Try again.`,
  };
  return new Promise((resolve) => {
    (async () => {
      const response = await fetch('/api/rumi/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text, voice, page }),
      }).catch(() => null);
      if (!response?.ok || !response.body) return resolve(failed);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answered = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf('\n')) >= 0) {
          const raw = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 1);
          try {
            const event = JSON.parse(raw) as {
              read?: string;
              delta?: string;
              reset?: boolean;
              done?: AskResult;
              kept?: { messageId: string; items: Kept[] };
            };
            if (event.read) onRead(event.read);
            if (typeof event.delta === 'string') onText({ delta: event.delta });
            if (event.reset) onText({ reset: true });
            if (event.done) {
              answered = true;
              resolve(event.done);
            }
            if (event.kept) onKept(event.kept.messageId, event.kept.items);
          } catch {
            /* a broken line is skipped */
          }
        }
        if (done) {
          if (!answered) resolve(failed);
          return;
        }
      }
    })().catch(() => resolve(failed));
  });
}

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
  nearCap: initialNear = false,
  today,
  drawer = false,
  voice: voiceInitial,
  page = null,
}: {
  conversationId: string | null;
  title: string | null;
  initial: Message[];
  budget: string;
  /** The month's spend shows only near the cap; Settings always has it (WI-060). */
  nearCap?: boolean;
  /** The owner's today, so a plan for today reads "Today". */
  today: string;
  /** In the drawer (WI-060) the page and its address stay as they are. */
  drawer?: boolean;
  /** Voice (WI-104): from the page; the drawer reads it once (undefined). */
  voice?: VoiceState | null;
  /** WI-117: the page the drawer is open on, for its record and its questions. */
  page?: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [current, setCurrent] = useState(conversationId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState(initialBudget);
  const [near, setNear] = useState(initialNear);
  const [pending, start] = useTransition();
  // WI-119: the answer as it is being written, until the stored one replaces it.
  const [draft, setDraft] = useState('');
  const [reads, setReads] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A refresh (after Add to plan, or Undo) brings the stored cards; keep any question in flight.
  const [seenInitial, setSeenInitial] = useState(initial);
  // The drawer has no stored copy to take: a page refresh must not clear it (WI-060).
  if (!drawer && initial !== seenInitial && !pending) {
    setSeenInitial(initial);
    setMessages(initial);
  }
  const end = useRef<HTMLDivElement>(null);
  const voice = useVoiceState(voiceInitial);
  const canDictate = useCanDictate();
  const mic = useComposerVoice({
    lang: voice?.lang ?? 'en-IN',
    text,
    setText,
  });
  const reader = useReplyVoice(voice);

  const send = (raw: string) => {
    const question = raw.trim();
    if (!question || pending) return;
    setError(null);
    setText('');
    if (mic.listening) mic.cancel();
    reader.stop();
    const spoken = voiceMeta(mic.take(), question);
    const local: Message = {
      id: `local-${Date.now()}`,
      role: 'USER',
      content: question,
    };
    setMessages((m) => [...m, local]);
    setReads([]);
    setDraft('');
    start(async () => {
      const result = await askStreaming(
        current,
        question,
        (tool) => setReads((r) => [...r, tool]),
        (messageId, items) => {
          setMessages((m) =>
            m.map((x) => (x.id === messageId ? { ...x, kept: items } : x)),
          );
          // The stored answer carries them too; a refresh in flight must not drop them.
          router.refresh();
        },
        spoken,
        page,
        (e) => setDraft((d) => (e.reset ? '' : d + (e.delta ?? ''))),
      );
      setDraft('');
      if (result.budget) setBudget(result.budget);
      if (result.nearCap !== undefined) setNear(result.nearCap);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessages((m) => [...m, { ...result.reply, role: 'ASSISTANT' }]);
      reader.read(result.reply.content);
      if (result.conversationId !== current) {
        setCurrent(result.conversationId);
        if (!drawer)
          router.replace(`/rumi?c=${result.conversationId}`, {
            scroll: false,
          });
      }
      router.refresh();
    });
  };

  // "Ask Rumi · …" from the command bar, Rumi noticed or Plan with Rumi: on arrival, or while
  // already here. The listener reads the latest render (WI-062): the drawer stays mounted across
  // pages, so a handover must continue the open conversation, and one that arrives while an
  // answer is coming waits in storage until it is done.
  const take = () => {
    if (pending) return;
    let q: string | null = null;
    try {
      q = sessionStorage.getItem(ASK_KEY);
      sessionStorage.removeItem(ASK_KEY);
    } catch {
      q = null;
    }
    if (q) send(q);
  };
  const latestTake = useRef(take);
  useEffect(() => {
    latestTake.current = take;
  });
  useEffect(() => {
    const listen = () => latestTake.current();
    window.addEventListener(ASK_EVENT, listen);
    return () => window.removeEventListener(ASK_EVENT, listen);
  }, []);
  // On arrival, and again once an answer finishes, in case a question waited.
  useEffect(() => {
    if (!pending) latestTake.current();
  }, [pending]);
  // Reply on one of Rumi's lines (WI-101): the words land in the composer, nothing is sent.
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const fill = () => {
      let q: string | null = null;
      try {
        q = sessionStorage.getItem(PREFILL_KEY);
        sessionStorage.removeItem(PREFILL_KEY);
      } catch {
        q = null;
      }
      if (!q) return;
      setText(q);
      setTimeout(() => {
        const el = input.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 0);
    };
    fill();
    window.addEventListener(PREFILL_EVENT, fill);
    return () => window.removeEventListener(PREFILL_EVENT, fill);
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, pending]);

  return (
    <section className="rumi-chat" aria-label={title ?? `Ask ${AGENT_NAME}`}>
      {current && (
        <div className="rumi-chat-head">
          {drawer ? (
            <a className="link" href={`/rumi?c=${current}`}>
              Open full page
            </a>
          ) : (
            <h2 className="rumi-chat-title">{title ?? 'New conversation'}</h2>
          )}
          {confirmDelete ? (
            <ActionForm
              action={deleteConversationAction}
              className="rumi-confirm"
              onSuccess={() => {
                if (!drawer) return router.replace('/rumi');
                setCurrent(null);
                setMessages([]);
                setConfirmDelete(false);
              }}
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
            <RumiPose pose="hello" size={124} className="rumi-empty-mark" />
            <p className="rumi-empty-lead">
              {AGENT_NAME} reads your schedule, study, practice and jobs, and
              answers from them. It never sees your notes.
            </p>
            <ul className="rumi-prompts" aria-label="Suggested questions">
              {promptsFor(pageRef(page)).map((p) => (
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
            <p className="rumi-who">
              {m.role === 'USER' ? (
                'You'
              ) : (
                <>
                  <RumiMark size={18} />
                  {AGENT_NAME}
                </>
              )}
            </p>
            {m.role === 'USER' ? (
              <p className="rumi-own">{m.content}</p>
            ) : (
              <div className="rumi-reply">
                <RumiText text={m.content} />
                {m.tools && readLine(m.tools) && (
                  <p className="rumi-read">{readLine(m.tools)}</p>
                )}
                {m.actions && m.actions.length > 0 && (
                  <ActionRows messageId={m.id} actions={m.actions} />
                )}
                {m.requests?.map((c) => (
                  <RequestCard key={c.id} messageId={m.id} card={c} />
                ))}
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
                {m.kept && m.kept.length > 0 && <KeptRows kept={m.kept} />}
              </div>
            )}
          </article>
        ))}
        {pending && draft && (
          <article className="rumi-message is-draft" data-role="rumi">
            <p className="rumi-who">
              <RumiMark size={18} state="busy" />
              {AGENT_NAME}
            </p>
            <div className="rumi-reply">
              <RumiText text={draft} />
            </div>
          </article>
        )}
        {pending && !draft && (
          <p className="rumi-reading" role="status">
            <RumiMark size={22} state="busy" />
            {(() => {
              // A change in progress names itself (WI-102); otherwise the reads so far.
              const writing = reads.filter(isWrite).at(-1);
              return writing
                ? `${AGENT_NAME} is ${WRITE_WORDS[writing]}…`
                : readingLine(reads);
            })()}
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
          ref={input}
          id="rumi-input"
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder={`Ask ${AGENT_NAME} about your week, roadmap or interviews`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Escape drops what the microphone heard and puts the typed text back (WI-104).
            if (e.key === 'Escape' && mic.listening) {
              e.preventDefault();
              e.stopPropagation();
              mic.cancel();
              return;
            }
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
        {voice?.consented && canDictate && (
          <MicButton listening={mic.listening} onClick={mic.toggle} />
        )}
        <button
          type="submit"
          className="button rumi-send"
          disabled={pending || !text.trim()}
          aria-label="Send"
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </form>
      {(mic.listening || mic.interim || mic.error || reader.speaking) && (
        <p className="rumi-voice-line" aria-live="polite">
          {mic.error ||
            (mic.listening
              ? mic.interim
                ? `Hearing: ${mic.interim}`
                : 'Listening… tap the microphone to stop, Escape to drop it.'
              : '')}
          {reader.speaking && <StopReading onClick={reader.stop} />}
        </p>
      )}
      {/* The spend lives in Settings; here only when the month is near its cap (WI-060). */}
      {near && <p className="rumi-budget">{budget}</p>}
    </section>
  );
}
