'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  executionAction,
  stopUnlinkedAction,
} from '@/features/schedule/actions';
import { audioRunning, playChime, unlockAudio } from '@/lib/sound';
import { playAmbient, stopAmbient } from '@/lib/ambient';
import { useWakeLock, useWakeLockSupported } from '@/lib/wake-lock';
import {
  focusLabel,
  focusTarget,
  INTENTION_MAX,
  intentionOf,
  LEARNED_MAX,
  minutesLeft,
  ringFraction,
  SOUND_NAMES,
  SOUNDS,
  targetMinutes,
  type Sound,
} from './focus-domain';

export type FocusBlock = {
  id: string;
  title: string;
  category: string;
  plannedStart: string;
  plannedEnd: string;
  /** "09:00–10:00" in the owner's zone. */
  window: string;
  /** Sessions start only on the block's own day. */
  canStart: boolean;
  /** A short target in minutes ("Start 20 min" from a study nudge), else the planned end. */
  minutes?: number | null;
};
export type FocusSession = {
  id: string;
  startedAt: string;
  notes: string | null;
  /** "since 09:02" in the owner's zone. */
  since: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000)),
    h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/**
 * A one-second clock that only ticks while the page is visible. It starts at the server's
 * render time so the first client render matches the server HTML, then follows the clock.
 */
function useNow(renderedAt: string) {
  const [now, setNow] = useState(() => Date.parse(renderedAt));
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') tick();
    }, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}

/**
 * A Focus preference kept in a cookie with no personal content, read on the client only (the
 * server renders the fallback): the chime (WI-027) and the ambient sound (WI-035).
 */
function cookieChoice<T extends string>(
  name: string,
  values: readonly T[],
  fallback: T,
) {
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (typeof document === 'undefined') return fallback;
    const value = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return values.includes(value as T) ? (value as T) : fallback;
  };
  return {
    set(value: T) {
      document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
      for (const fn of listeners) fn();
    },
    useValue() {
      return useSyncExternalStore(
        (fn) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        read,
        () => fallback,
      );
    },
  };
}
const chimeChoice = cookieChoice('silsila-focus-chime', ['on', 'off'], 'off');
const soundChoice = cookieChoice<'off' | Sound>(
  'silsila-focus-sound',
  ['off', ...SOUNDS],
  'off',
);

/** The sounds that played in this session, kept for the tab so a reload does not lose them. */
function playedSounds(sessionId: string) {
  const key = `silsila-sounds:${sessionId}`;
  const read = () => {
    try {
      return sessionStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  };
  return {
    read,
    add(sound: Sound) {
      const list = new Set(read().split(' ').filter(Boolean)).add(sound);
      try {
        sessionStorage.setItem(key, [...list].join(' '));
      } catch {
        // Private mode: the sound still plays; it just is not written to the notes.
      }
    },
  };
}

/**
 * Plays the chosen ambient sound while `active`. When audio is still locked (a reload), it
 * waits for the owner's next tap or key instead of starting a context without a gesture.
 */
function useAmbient(sound: 'off' | Sound, active: boolean, sessionId: string) {
  useEffect(() => {
    if (sound === 'off' || !active) return;
    const played = playedSounds(sessionId);
    const go = () => {
      unlockAudio();
      playAmbient(sound);
      played.add(sound);
    };
    if (audioRunning()) {
      go();
      return stopAmbient;
    }
    const once = () => {
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('keydown', once);
      go();
    };
    document.addEventListener('pointerdown', once);
    document.addEventListener('keydown', once);
    return () => {
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('keydown', once);
      stopAmbient();
    };
  }, [sound, active, sessionId]);
}

/** Off / Rain / Brown noise, saved on choice like the theme switch. */
function SoundSwitch({
  value,
  onChoose,
}: {
  value: 'off' | Sound;
  onChoose: (value: 'off' | Sound) => void;
}) {
  return (
    <fieldset className="focus-sound">
      <legend className="sr-only">Sound</legend>
      {(['off', ...SOUNDS] as const).map((option) => (
        <label key={option} className={value === option ? 'is-on' : ''}>
          <input
            type="radio"
            name="focus-sound"
            value={option}
            checked={value === option}
            onChange={() => onChoose(option)}
          />
          {option === 'off' ? 'No sound' : SOUND_NAMES[option]}
        </label>
      ))}
    </fieldset>
  );
}

const pipSupported = () =>
  typeof window !== 'undefined' && 'documentPictureInPicture' in window;
const noop = () => () => undefined;
type PipApi = {
  requestWindow: (o: { width: number; height: number }) => Promise<Window>;
};

/** The ring: a track and an arc that fills as the session moves toward its target. */
function Ring({
  fraction,
  size = 280,
  children,
}: {
  fraction: number | null;
  size?: number;
  children: React.ReactNode;
}) {
  const r = 46,
    c = 2 * Math.PI * r;
  return (
    <div className="focus-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="focus-ring-track" cx="50" cy="50" r={r} />
        {fraction !== null && (
          <circle
            className="focus-ring-arc"
            cx="50"
            cy="50"
            r={r}
            strokeDasharray={c}
            // The arc is the time left: it drains toward the target, then closes full.
            strokeDashoffset={fraction >= 1 ? 0 : c * fraction}
          />
        )}
      </svg>
      <div className="focus-ring-text">{children}</div>
    </div>
  );
}

/**
 * The Focus session (WI-027): an intention before Begin, then a ring that drains toward the
 * block's planned end, an optional pop-out window and screen wake lock where the browser has
 * them, a chime the owner can switch on, and "What did you learn?" before Complete. Only the
 * existing start, stop and complete actions write.
 */
export function FocusView({
  title,
  block,
  session,
  renderedAt,
}: {
  title: string;
  block: FocusBlock | null;
  session: FocusSession | null;
  /** The server's clock when the page rendered (ISO). */
  renderedAt: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== 'Escape' ||
        document.documentElement.hasAttribute('data-panel-open') ||
        (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      router.push('/today');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);
  return (
    <div className="focus-page" onPointerDown={unlockAudio}>
      <Link className="link" href="/today" prefetch={false}>
        <ArrowLeft size={14} aria-hidden="true" /> Today
      </Link>
      <p className="eyebrow mt-4">
        Focus
        {block?.minutes
          ? ` · ${block.minutes} min`
          : block?.window
            ? ` · ${block.window}`
            : ''}
      </p>
      <h1 className="focus-title">{title}</h1>
      {session ? (
        <Running
          block={block}
          session={session}
          title={title}
          renderedAt={renderedAt}
        />
      ) : block ? (
        <Begin block={block} />
      ) : null}
    </div>
  );
}

function Begin({ block }: { block: FocusBlock }) {
  if (!block.canStart)
    return (
      <section className="focus-card">
        <p>
          Focus starts a session, and sessions start on the block&apos;s own day
          while it is still planned.
        </p>
        <Link className="button secondary" href="/today" prefetch={false}>
          Back to Today
        </Link>
      </section>
    );
  return (
    <section className="focus-card" aria-label="Begin a focus session">
      <ActionForm
        action={executionAction}
        label={`Begin ${block.title}`}
        className="focus-begin"
      >
        <input type="hidden" name="id" value={block.id} />
        <label className="focus-field">
          <span>Intention (optional)</span>
          <input
            name="intention"
            maxLength={INTENTION_MAX}
            autoComplete="off"
            placeholder="What would make this session worth it?"
            autoFocus
          />
        </label>
        <div className="focus-actions">
          <Button name="action" value="start">
            Begin<span className="sr-only">: {block.title}</span>
          </Button>
        </div>
      </ActionForm>
    </section>
  );
}

function Running({
  block,
  session,
  title,
  renderedAt,
}: {
  block: FocusBlock | null;
  session: FocusSession;
  title: string;
  renderedAt: string;
}) {
  const router = useRouter();
  const now = useNow(renderedAt);
  const started = new Date(session.startedAt);
  const target = block?.minutes
    ? new Date(+started + block.minutes * 60_000)
    : block
      ? focusTarget({
          startedAt: started,
          plannedStart: new Date(block.plannedStart),
          plannedEnd: new Date(block.plannedEnd),
        })
      : null;
  const at = new Date(now);
  const fraction = target ? ringFraction(started, target, at) : null;
  const left = target ? minutesLeft(target, at) : null;
  const total = target ? targetMinutes(started, target) : null;
  const done = target ? +at >= +target : false;
  const intention = intentionOf(session.notes);
  const chime = chimeChoice.useValue() === 'on';
  const sound = soundChoice.useValue();
  // The sound fades out when the time is up, unless the owner picks one again after that.
  const [soundAfterTime, setSoundAfterTime] = useState(false);
  useAmbient(sound, !done || soundAfterTime, session.id);
  const wakeSupported = useWakeLockSupported();
  const [awake, setAwake] = useState(true);
  useWakeLock(awake && wakeSupported);
  const canPip = useSyncExternalStore(noop, pipSupported, () => false);
  const [pip, setPip] = useState<Window | null>(null);
  const [pipFailed, setPipFailed] = useState(false);
  const [showLearned, setShowLearned] = useState(false);
  const learnedOpen = showLearned || done;
  // The chime plays once, when the target passes while Focus is open (not on a later reload).
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current && chime) {
      const key = `silsila-chimed:${session.id}`;
      let chimed = false;
      try {
        chimed = sessionStorage.getItem(key) === '1';
        sessionStorage.setItem(key, '1');
      } catch {
        // Private mode: the ref above still keeps it to one chime in this view.
      }
      if (!chimed) playChime();
    }
    wasDone.current = done;
  }, [done, chime, session.id]);
  // The ring as words for assistive technology, in five-minute steps so it changes (and is
  // announced) at most every five minutes.
  const announced =
    left !== null && total !== null
      ? focusLabel(left === 0 ? 0 : Math.ceil(left / 5) * 5, total)
      : `${Math.floor((now - +started) / 300_000) * 5} minutes so far`;
  useEffect(() => () => pip?.close(), [pip]);
  const popOut = async () => {
    const api = (window as unknown as { documentPictureInPicture?: PipApi })
      .documentPictureInPicture;
    if (!api) return;
    try {
      const w = await api.requestWindow({ width: 260, height: 300 });
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const style = w.document.createElement('style');
          style.textContent = Array.from(sheet.cssRules)
            .map((r) => r.cssText)
            .join('\n');
          w.document.head.append(style);
        } catch {
          if (sheet.href) {
            const link = w.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            w.document.head.append(link);
          }
        }
      }
      w.document.documentElement.className = document.documentElement.className;
      w.document.body.className = 'focus-pip-body';
      w.document.title = title;
      w.addEventListener('pagehide', () => setPip(null));
      setPipFailed(false);
      setPip(w);
    } catch {
      // Some embedded or locked-down browsers expose the API but cannot open the window.
      setPip(null);
      setPipFailed(true);
    }
  };
  const submitted = useRef<string | null>(null);
  const ringBody = (
    <>
      {done && total !== null ? (
        <>
          <strong>{total} min</strong>
          <span>Time is up</span>
        </>
      ) : target ? (
        <>
          <strong suppressHydrationWarning>{clock(+target - now)}</strong>
          <span>left of {total} min</span>
        </>
      ) : (
        <>
          <strong suppressHydrationWarning>{clock(now - +started)}</strong>
          <span>since {session.since}</span>
        </>
      )}
    </>
  );
  return (
    <section className="focus-card" aria-label="Focus session">
      {intention && (
        <p className="focus-intention">
          <span className="eyebrow">Intention</span>
          {intention}
        </p>
      )}
      <Ring fraction={done ? 1 : fraction}>{ringBody}</Ring>
      <p className="sr-only" aria-live="polite" suppressHydrationWarning>
        {announced}
      </p>
      {pipFailed && (
        <p className="focus-hint" role="status">
          This browser could not open the pop-out window. Focus keeps running
          here.
        </p>
      )}
      <SoundSwitch
        value={sound}
        onChoose={(value) => {
          unlockAudio();
          if (done) setSoundAfterTime(true);
          soundChoice.set(value);
        }}
      />
      <div className="focus-tools">
        {canPip && (
          <Button
            type="button"
            className="secondary small"
            onClick={() => (pip ? pip.close() : void popOut())}
          >
            {pip ? 'Close pop-out' : 'Pop out'}
          </Button>
        )}
        {wakeSupported && (
          <label className="check">
            <input
              type="checkbox"
              checked={awake}
              onChange={(e) => setAwake(e.target.checked)}
            />
            Keep screen on
          </label>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={chime}
            onChange={(e) => {
              unlockAudio();
              chimeChoice.set(e.target.checked ? 'on' : 'off');
            }}
          />
          Chime at the end
        </label>
      </div>
      {block ? (
        <ActionForm
          action={executionAction}
          label={`Finish ${block.title}`}
          className="focus-finish"
          onPending={(form) => {
            submitted.current = String(form.get('action') ?? '');
            form.set('sound', playedSounds(session.id).read());
          }}
          onSettled={(result) => {
            if (result.ok && submitted.current) router.push('/today');
          }}
        >
          <input type="hidden" name="id" value={block.id} />
          {learnedOpen ? (
            <label className="focus-field">
              <span>What did you learn? (optional)</span>
              <input
                name="learned"
                maxLength={LEARNED_MAX}
                autoComplete="off"
                autoFocus={done}
              />
            </label>
          ) : (
            <button
              type="button"
              className="link-button focus-learned-toggle"
              onClick={() => setShowLearned(true)}
            >
              Add what you learned
            </button>
          )}
          {/* Complete comes first so Enter in the learned line completes; CSS shows it last. */}
          <div className="focus-actions is-reversed">
            <Button name="action" value="complete">
              Complete<span className="sr-only">: {block.title}</span>
            </Button>
            <Button className="secondary" name="action" value="stop">
              Stop<span className="sr-only">: {block.title}</span>
            </Button>
          </div>
        </ActionForm>
      ) : (
        <ActionForm
          action={stopUnlinkedAction}
          label="Stop the running session"
          className="focus-finish"
          onSettled={(result) => {
            if (result.ok) router.push('/today');
          }}
        >
          <input type="hidden" name="id" value={session.id} />
          <div className="focus-actions">
            <Button>Stop session</Button>
          </div>
        </ActionForm>
      )}
      <p className="focus-hint">
        Esc returns to Today · the timer keeps running
      </p>
      {pip &&
        createPortal(
          <div className="focus-pip">
            <Ring fraction={done ? 1 : fraction} size={190}>
              {ringBody}
            </Ring>
            <p>{title}</p>
          </div>,
          pip.document.body,
        )}
    </section>
  );
}
