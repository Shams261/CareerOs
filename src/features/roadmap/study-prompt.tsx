'use client';
import { useId, useState, useSyncExternalStore } from 'react';
import { Check, Copy } from 'lucide-react';
import { renderPrompt, type PromptItem, type Scenario } from './domain';

const listeners = new Set<() => void>();
function subscribeStorage(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}
function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * "Copy prompt": the roadmap's template filled with this item, for Claude or ChatGPT. One strip:
 * the button, the scenario beside it, and a doubt behind "+ Add a doubt". As a `card` (WI-085)
 * it is the first of the study tools: a titled card whose button copies, with the scenario and
 * the doubt under it. Renders on the client so the owner can pick a scenario and add a doubt
 * before copying.
 */
export function StudyPrompt({
  roadmap,
  template,
  scenarios,
  item,
  storageKey,
  card = false,
  title = 'Copy the study prompt',
  onCopy,
}: {
  roadmap: { title: string };
  template: string | null;
  scenarios: Scenario[];
  item: PromptItem;
  /** When given, the last scenario chosen is remembered in this browser under this key. */
  storageKey?: string;
  /** The tool-card look of the roadmap pane. */
  card?: boolean;
  title?: string;
  /** Called once the text is copied (the pane starts the item by itself). */
  onCopy?: () => void;
}) {
  // The remembered choice lives in this browser; the server renders the first scenario.
  const remembered = useSyncExternalStore(
    subscribeStorage,
    () => (storageKey ? readStored(storageKey) : null),
    () => null,
  );
  const [picked, setPicked] = useState<string | null>(null);
  const scenarioId =
    picked ??
    (remembered && scenarios.some((s) => s.id === remembered)
      ? remembered
      : (scenarios[0]?.id ?? ''));
  const choose = (id: string) => {
    setPicked(id);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, id);
      listeners.forEach((l) => l());
    } catch {
      /* storage unavailable */
    }
  };
  const [extra, setExtra] = useState('');
  const [doubtOpen, setDoubtOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const id = useId();
  const scenario =
    scenarios.find((s) => s.id === scenarioId) ?? scenarios[0] ?? null;
  if (!scenario) return null;
  const text = renderPrompt(template, roadmap, item, scenario, extra);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('manual');
    }
    onCopy?.();
  }
  const controls = (
    <>
      <label className="study-scenario">
        <span className="sr-only">Scenario</span>
        <select value={scenario.id} onChange={(e) => choose(e.target.value)}>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="link-button"
        aria-expanded={doubtOpen}
        aria-controls={`${id}-doubt`}
        onClick={() => setDoubtOpen((o) => !o)}
      >
        {extra ? 'Edit the doubt' : '+ Add a doubt'}
      </button>
      {state === 'copied' && (
        <span className="form-success" role="status">
          <Check size={14} aria-hidden="true" /> Copied. Paste it into Claude or
          ChatGPT.
        </span>
      )}
    </>
  );
  const doubt = (
    <>
      <div id={`${id}-doubt`} hidden={!doubtOpen} className="study-doubt">
        <label>
          My doubt or extra link (optional)
          <input
            value={extra}
            maxLength={2000}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Why does the retry duplicate the write?"
          />
        </label>
      </div>
      {state === 'manual' && (
        <label htmlFor={`${id}-text`} className="study-manual">
          Clipboard unavailable here; select and copy the text.
          <textarea id={`${id}-text`} readOnly rows={12} value={text} />
        </label>
      )}
    </>
  );
  if (card)
    return (
      <div className="pane-tool is-prompt">
        <button type="button" className="pane-tool-main" onClick={copy}>
          <b>
            <Copy size={15} aria-hidden="true" /> {title}
          </b>
          <span>
            {scenario.name} · for Claude or ChatGPT
            {extra ? ' · with your doubt' : ''}
          </span>
        </button>
        <div className="study-strip">{controls}</div>
        {doubt}
      </div>
    );
  // On a problem page the button and the scenario are one control (WI-093): Copy prompt,
  // then the scenario it carries, joined.
  return (
    <div className="study-prompt">
      <div className="study-strip">
        <span className="study-split">
          <button
            type="button"
            className="button secondary small"
            onClick={copy}
          >
            <Copy size={14} aria-hidden="true" /> Copy prompt
          </button>
          <label className="study-scenario">
            <span className="sr-only">Scenario</span>
            <select
              value={scenario.id}
              onChange={(e) => choose(e.target.value)}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </span>
        <button
          type="button"
          className="link-button"
          aria-expanded={doubtOpen}
          aria-controls={`${id}-doubt`}
          onClick={() => setDoubtOpen((o) => !o)}
        >
          {extra ? 'Edit the doubt' : '+ Add a doubt'}
        </button>
        {state === 'copied' && (
          <span className="form-success" role="status">
            <Check size={14} aria-hidden="true" /> Copied. Paste it into Claude
            or ChatGPT.
          </span>
        )}
      </div>
      {doubt}
    </div>
  );
}
