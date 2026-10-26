'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_TICKS,
  MODEL_LABEL,
  PROVIDER_LABEL,
  studyInput,
  type StudyItem,
} from '@/features/ai/domain';
import { SentFields } from '@/features/ai/sent-fields';
import { listenAction } from './actions';
import { sourcePlan, TIER_LABEL, type Passage } from './domain';
import type { ListenScript } from './service';

const noop = () => () => undefined;
const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;
const RATES = [
  ['0.9', 'Slower'],
  ['1', 'Normal'],
  ['1.15', 'Faster'],
] as const;

/** The device's voices, English first and on-device voices before network ones. */
function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!speechSupported()) return;
    const load = () =>
      setVoices(
        speechSynthesis
          .getVoices()
          .filter((v) => v.lang.toLowerCase().startsWith('en'))
          .sort((a, b) => Number(b.localService) - Number(a.localService)),
      );
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

const fetchedLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/**
 * Listen (WI-037). First what will be sent and which sources will be fetched; then the
 * checked script, read aloud by the device's own voice line by line, each line with the
 * passages that support it, and the passages themselves with their link and fetch time.
 */
export function Listen({
  item,
  budget,
}: {
  item: StudyItem & { id: string };
  budget: string;
}) {
  const plan = useMemo(() => sourcePlan(item.references), [item.references]);
  const payload = useMemo(() => studyInput(item, DEFAULT_TICKS(item)), [item]);
  const [script, setScript] = useState<ListenScript | null>(null);
  const [error, setError] = useState('');
  const [spent, setSpent] = useState(budget);
  const [pending, start] = useTransition();
  const canSpeak = useSyncExternalStore(noop, speechSupported, () => false);
  const voices = useVoices();
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState('1');
  const [at, setAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Bumped on every stop, so a line that ends after Stop does not start the next one.
  const run = useRef(0);

  const send = () =>
    start(async () => {
      setError('');
      const r = await listenAction(item.id);
      if (r.budget) setSpent(r.budget);
      if (r.ok) setScript(r.script);
      else setError(r.message);
    });
  useEffect(() => {
    if (script) heading.current?.focus();
  }, [script]);

  // The spoken script: the item's title, the checked lines, and a closing line.
  const spoken = useMemo(
    () =>
      script
        ? [
            `${item.title}.`,
            ...script.lines.map((l) => l.text),
            'That is the script. Its sources are on screen.',
          ]
        : [],
    [script, item.title],
  );
  const stop = useCallback(() => {
    run.current++;
    if (speechSupported()) speechSynthesis.cancel();
    setAt(null);
    setPaused(false);
  }, []);
  useEffect(() => stop, [stop]);
  const speakFrom = (index: number) => {
    if (!speechSupported()) return;
    const id = ++run.current;
    speechSynthesis.cancel();
    setPaused(false);
    const say = (i: number) => {
      if (id !== run.current) return;
      if (i >= spoken.length) {
        setAt(null);
        return;
      }
      setAt(i);
      const u = new SpeechSynthesisUtterance(spoken[i]);
      const v = voices.find((x) => x.voiceURI === voice) ?? voices[0];
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'en-US';
      u.rate = Number(rate);
      u.onend = () => say(i + 1);
      u.onerror = () => {
        if (id === run.current) setAt(null);
      };
      speechSynthesis.speak(u);
    };
    say(index);
  };
  const byId = useMemo(
    () => new Map((script?.passages ?? []).map((p) => [p.id, p])),
    [script],
  );

  if (!script)
    return (
      <div className="grill listen">
        <section aria-labelledby="listen-sent">
          <h3 id="listen-sent">What will be sent</h3>
          <SentFields payload={payload} />
          <p className="muted listen-note">
            With passages from these sources, fetched when you press Listen.
          </p>
          <ul className="listen-sources">
            {plan.fetch.map((s) => (
              <li key={s.url}>
                <span
                  className={`pill ${s.tier === 'official' ? 'success' : ''}`}
                >
                  {TIER_LABEL[s.tier]}
                </span>{' '}
                {s.label} <span className="muted">· {s.host}</span>
              </li>
            ))}
            {plan.skipped.map((s) => (
              <li key={`${s.host}:${s.label}`} className="muted">
                {s.label} · not fetched: {s.reason}
              </li>
            ))}
          </ul>
          <p className="grill-facts muted">
            A line is kept only when official docs, or two different sites,
            support it. {MODEL_LABEL} · {PROVIDER_LABEL} · {spent}
          </p>
        </section>
        <Button type="button" onClick={send} disabled={pending}>
          {pending ? 'Fetching and checking…' : 'Fetch sources and write'}
        </Button>
        {error && (
          <p className="form-message" role="alert">
            {error}
          </p>
        )}
      </div>
    );

  const chip = (p: Passage | undefined) =>
    p ? (
      <a
        key={p.id}
        href={`#listen-${p.id}`}
        className="listen-chip"
        title={`${p.label} · ${TIER_LABEL[p.tier]}`}
      >
        {p.id}
      </a>
    ) : null;
  return (
    <div className="grill listen">
      <h3 ref={heading} tabIndex={-1}>
        Listen · {script.lines.length} checked lines
      </h3>
      {canSpeak ? (
        <div className="listen-player">
          {at === null ? (
            <Button type="button" onClick={() => speakFrom(0)}>
              Play
            </Button>
          ) : paused ? (
            <Button
              type="button"
              onClick={() => {
                speechSynthesis.resume();
                setPaused(false);
              }}
            >
              Resume
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                speechSynthesis.pause();
                setPaused(true);
              }}
            >
              Pause
            </Button>
          )}
          {at !== null && (
            <Button type="button" className="secondary" onClick={stop}>
              Stop
            </Button>
          )}
          {voices.length > 1 && (
            <label>
              <span className="sr-only">Voice</span>
              <select
                value={voice}
                onChange={(e) => {
                  stop();
                  setVoice(e.target.value);
                }}
              >
                <option value="">Default voice</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="sr-only">Speed</span>
            <select
              value={rate}
              onChange={(e) => {
                stop();
                setRate(e.target.value);
              }}
            >
              {RATES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="muted">
          This browser has no voice to read with; the script is below to read.
        </p>
      )}
      <ol className="listen-lines">
        {script.lines.map((l, i) => (
          <li
            key={i}
            className={at === i + 1 ? 'is-speaking' : undefined}
            aria-current={at === i + 1 ? 'true' : undefined}
          >
            <span>{l.text}</span>{' '}
            <span className="listen-chips">
              {l.sources.map((id) => chip(byId.get(id)))}
            </span>
          </li>
        ))}
      </ol>
      {script.dropped && <p className="muted listen-note">{script.dropped}</p>}
      <section aria-labelledby="listen-passages">
        <h4 id="listen-passages">Passages used</h4>
        <ul className="listen-passages">
          {script.passages.map((p) => (
            <li key={p.id} id={`listen-${p.id}`}>
              <p className="listen-passage-head">
                <strong>{p.id}</strong>{' '}
                <span
                  className={`pill ${p.tier === 'official' ? 'success' : ''}`}
                >
                  {TIER_LABEL[p.tier]}
                </span>{' '}
                <a
                  className="link"
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {p.label}
                </a>{' '}
                <span className="muted">
                  · {p.host} · fetched {fetchedLabel(p.fetchedAt)}
                </span>
              </p>
              <blockquote>{p.text}</blockquote>
            </li>
          ))}
        </ul>
        {script.failed.length > 0 && (
          <p className="muted listen-note">
            Couldn’t read: {script.failed.map((f) => f.label).join(', ')}.
          </p>
        )}
      </section>
    </div>
  );
}
