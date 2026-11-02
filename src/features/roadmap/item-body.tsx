'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { confidenceWord } from '@/features/dsa/words';
import { useRef } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { PanelButton, SidePanel, closePanel } from '@/components/side-panel';
import { MoreMenu } from '@/components/more-menu';
import { ActionForm } from '@/components/action-form';
import { askedNoteAction, itemOpAction, noteAction } from './actions';
import { ItemForm } from './item-form';
import { StudyPrompt } from './study-prompt';
import type { ItemStatus, Reference, Scenario } from './domain';
import {
  kindBadge,
  linkTitle,
  primaryAction,
  problemFacts,
  scopeLines,
} from './week-items-domain';
import { Button } from '@/components/ui/button';
import { GrillMe } from '@/features/ai/grill';
import { Listen } from '@/features/listen/listen';
import { removeCardAction } from '@/features/ai/actions';
import type { Row } from './week-items';
import { StudyHint } from './study-hint';

const tone = { RED: 'danger', YELLOW: 'warning', GREEN: 'success' } as const;

/**
 * One item as a task card (WI-085), inside its row since WI-088: the goal (Done when) first,
 * the scope as bullets, the references as rows to study from, the three study tools as cards,
 * the note always present, and one foot with one primary action for the state (Mark done, Mark
 * revised, Record an attempt), the interview mark and ⋯. A problem-linked item shows the
 * problem card instead: its facts, Open on LeetCode, Record an attempt. The status is shown,
 * never chosen: copying the prompt or opening a reference starts an item by itself.
 */
export function ItemBody({
  row,
  status,
  roadmap,
  scenarios,
  sections,
  grill,
  flip,
  settle,
}: {
  row: Row;
  status: ItemStatus;
  roadmap: { id: string; title: string; promptTemplate: string | null };
  scenarios: Scenario[];
  sections: string[];
  grill: { budget: string } | null;
  flip: (id: string, f: FormData) => void;
  settle: (id: string, ok: boolean | undefined) => void;
}) {
  const { item, revision, links, cards, grillable, listenable } = row;
  const references = (item.references as Reference[] | null) ?? [];
  // An item edited into another week is followed there, with the row open (WI-089).
  const router = useRouter();
  const editedSection = useRef<string | null>(null);
  const followMove = (r: { ok?: boolean }) => {
    const to = editedSection.current;
    editedSection.current = null;
    if (!r.ok || !to || to === item.section) return;
    // The panel closes itself only on a path change; this is the same path, another week.
    closePanel();
    router.push(
      `/roadmap/${roadmap.id}?section=${encodeURIComponent(to)}#item-${item.id}`,
    );
  };
  // A problem item follows Practice (WI-046): its marks come from attempts there.
  const practice = links.dsaProblem
    ? `/dsa/${links.dsaProblem.id}?from=${item.id}`
    : null;
  const due = revision === 'due' || revision === 'overdue';
  const primary = primaryAction({ status, revision, practice: !!practice });
  const facts = practice ? problemFacts(item.scope) : null;
  const scope = practice ? [] : scopeLines(item.scope);
  // Studying starts the item by itself: the prompt copied or a reference opened.
  const startRef = useRef<HTMLButtonElement>(null);
  const autoStart = () => {
    if (status === 'NOT_STARTED' && !practice) startRef.current?.click();
  };
  const promptItem = {
    title: item.title,
    section: item.section,
    scope: item.scope,
    checkpoint: item.checkpoint,
    priority: item.priority,
    estimateMinutes: item.estimateMinutes,
    references,
    notes: item.notes,
    url: item.url,
  };
  const studyItem = {
    id: item.id,
    title: item.title,
    scope: item.scope,
    checkpoint: item.checkpoint,
    references: item.references,
  };
  const estimate = item.estimateMinutes
    ? item.estimateMinutes >= 60
      ? `${Math.round((item.estimateMinutes / 60) * 10) / 10} h`
      : `${item.estimateMinutes} min`
    : null;
  const meta = [
    item.askedInInterview ? 'asked' : null,
    facts?.difficulty,
    estimate,
    !practice && status !== 'DONE' ? 'Revision 7 days after done' : null,
  ].filter(Boolean);
  return (
    <div className="item-card">
      {meta.length > 0 && (
        <p className="item-metaline">
          {item.askedInInterview && (
            <span className="pill success">Asked in an interview</span>
          )}
          {facts?.difficulty && <span>{facts.difficulty}</span>}
          {estimate && <span>{estimate}</span>}
          {!practice && status !== 'DONE' && (
            <span className="muted">Revision 7 days after done</span>
          )}
        </p>
      )}
      {facts && links.dsaProblem && (
        <dl className="pane-stats">
          <div>
            <dt>Confidence</dt>
            <dd>
              <span
                className={`pill ${links.dsaProblem.attemptsCount ? tone[links.dsaProblem.confidence] : ''}`}
              >
                {links.dsaProblem.attemptsCount
                  ? confidenceWord(links.dsaProblem.confidence)
                  : 'Unattempted'}
              </span>
            </dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>{links.dsaProblem.attemptsCount}</dd>
          </div>
          <div>
            <dt>Next revision</dt>
            <dd>{links.dsaProblem.nextRevision ?? 'Not scheduled'}</dd>
          </div>
          {facts.pattern && (
            <div>
              <dt>Pattern</dt>
              <dd>{facts.pattern}</dd>
            </div>
          )}
        </dl>
      )}
      {facts && (facts.lists.length > 0 || facts.companies.length > 0) && (
        <p className="pane-chips">
          {facts.lists.map((l) => (
            <span className="chip" key={l}>
              {l}
            </span>
          ))}
          {facts.companies.length > 0 && (
            <span className="chip">Asked at {facts.companies.join(', ')}</span>
          )}
        </p>
      )}
      {item.checkpoint && (
        <div className="pane-goal">
          <b>Done when</b>
          <span>{item.checkpoint}</span>
        </div>
      )}
      {scope.length > 1 && (
        <div className="pane-block">
          <b>Scope</b>
          <ul className="pane-scope">
            {scope.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {scope.length === 1 && (
        <div className="pane-block">
          <b>Scope</b>
          <p className="pane-scope-line">{scope[0]}</p>
        </div>
      )}
      {(references.length > 0 || item.url) && (
        <div className="pane-block">
          <b>{practice ? 'Solve' : 'Study here first'}</b>
          <ul className="plain-list pane-refs">
            {item.url && (
              <li>
                <a
                  className="pane-ref"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={autoStart}
                >
                  <span className="pane-ref-kind" aria-hidden="true">
                    {practice ? 'GO' : 'LINK'}
                  </span>
                  <span className="pane-ref-title">
                    {linkTitle(item.url)}
                    <small>
                      {item.url.replace(/^https?:\/\/(www\.)?/, '')}
                    </small>
                  </span>
                  <span className="pane-ref-open">
                    Open <ExternalLink size={13} aria-hidden="true" />
                  </span>
                </a>
              </li>
            )}
            {references.map((r) => (
              <li key={r.url}>
                <a
                  className="pane-ref"
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={autoStart}
                >
                  <span className="pane-ref-kind" aria-hidden="true">
                    {kindBadge(r.kind)}
                  </span>
                  <span className="pane-ref-title">
                    {r.label}
                    {r.kind && <small>{r.kind}</small>}
                  </span>
                  <span className="pane-ref-open">
                    Open <ExternalLink size={13} aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(links.learningTopic || links.dsaTopic) && (
        <p className="item-links">
          {links.learningTopic && (
            <Link
              prefetch={false}
              className="link"
              href={`/learn/topics/${links.learningTopic.id}`}
            >
              {links.learningTopic.subject} — {links.learningTopic.title}
            </Link>
          )}
          {links.dsaTopic && (
            <span className="muted">Practice topic: {links.dsaTopic.name}</span>
          )}
        </p>
      )}
      <div className="pane-block">
        <b>{practice ? 'If stuck' : 'Then, with Silsila'}</b>
        <StudyHint />
        <div className="pane-tools">
          <StudyPrompt
            card
            title={
              practice ? 'Copy the pattern prompt' : 'Copy the study prompt'
            }
            roadmap={{ title: roadmap.title }}
            template={roadmap.promptTemplate}
            scenarios={scenarios}
            storageKey={`silsila-scenario:${roadmap.id}`}
            item={promptItem}
            onCopy={autoStart}
          />
          {grill && grillable && (
            <PanelButton
              panel={`grill:${item.id}`}
              className="pane-tool"
              data-grill-open
            >
              <b>Grill me</b>
              <span>
                {practice
                  ? 'Five questions on the pattern'
                  : 'Five questions on this item, kept as cards'}
              </span>
            </PanelButton>
          )}
          {grill && listenable && (
            <PanelButton
              panel={`listen:${item.id}`}
              className="pane-tool"
              data-listen-open
            >
              <b>Listen</b>
              <span>A spoken summary from the references</span>
            </PanelButton>
          )}
        </div>
      </div>
      <ActionForm
        action={noteAction}
        label={`Note for ${item.title}`}
        className="pane-note"
      >
        <input type="hidden" name="id" value={item.id} />
        <label>
          <b>My note</b>
          <textarea
            name="notes"
            rows={item.notes ? 3 : 1}
            maxLength={20000}
            defaultValue={item.notes ?? ''}
            placeholder="What tripped me up, a link, a reminder for next time"
            onFocus={(e) => {
              e.currentTarget.rows = 3;
            }}
            onBlur={(e) => {
              if (e.currentTarget.value !== (item.notes ?? ''))
                e.currentTarget.form?.requestSubmit();
            }}
          />
        </label>
      </ActionForm>
      {item.askedInInterview && (
        <ActionForm
          action={askedNoteAction}
          label={`Where ${item.title} came up`}
          className="asked-form"
        >
          <input type="hidden" name="id" value={item.id} />
          <label>
            Asked at
            <input
              name="askedNote"
              maxLength={200}
              defaultValue={item.askedNote ?? ''}
              placeholder="Amazon phone screen, Oct 2026"
              onBlur={(e) => {
                if (e.currentTarget.value !== (item.askedNote ?? ''))
                  e.currentTarget.form?.requestSubmit();
              }}
            />
          </label>
        </ActionForm>
      )}
      {cards.length > 0 && (
        <section
          className="kept-cards"
          aria-label={`Kept cards for ${item.title}`}
        >
          <p className="eyebrow">Kept cards · {cards.length}</p>
          <ul className="plain-list">
            {cards.map((c) => (
              <li key={c.id} className="kept-card">
                <p className="kept-card-q">{c.question}</p>
                {c.change && (
                  <p className="muted kept-card-change">{c.change}</p>
                )}
                <ul>
                  {c.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <ActionForm
                  action={removeCardAction}
                  broadcast="roadmap-items"
                  label={`Remove the card ${c.question}`}
                >
                  <input type="hidden" name="id" value={c.id} />
                  <Button variant="link" className="danger small">
                    Remove card
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Started by itself, quietly: the badge and the row icon are the only answer. */}
      <ActionForm
        action={itemOpAction}
        className="pane-autostart"
        onPending={(f) => flip(item.id, f)}
        onSettled={(r) => settle(item.id, r.ok)}
      >
        <input type="hidden" name="id" value={item.id} />
        <button ref={startRef} name="op" value="start" tabIndex={-1} hidden />
      </ActionForm>
      <ActionForm
        action={itemOpAction}
        broadcast="roadmap-items"
        className="item-foot-form"
        onPending={(f) => flip(item.id, f)}
        onSettled={(r) => settle(item.id, r.ok)}
      >
        <input type="hidden" name="id" value={item.id} />
        <div className="item-foot">
          {primary === 'attempt' && (
            <Link prefetch={false} className="button" href={practice!}>
              Record an attempt
            </Link>
          )}
          {primary === 'done' && (
            <button className="button" name="op" value="done">
              <Check size={15} aria-hidden="true" /> Mark done
            </button>
          )}
          {primary === 'revised' && (
            <button className="button" name="op" value="revised">
              <Check size={15} aria-hidden="true" /> Mark revised
            </button>
          )}
          {primary === 'is-done' && (
            <span className="status-badge is-on item-foot-done">
              <Check size={14} aria-hidden="true" /> Done
            </span>
          )}
          <button
            className={`button secondary small${item.askedInInterview ? ' is-pressed' : ''}`}
            name="op"
            value={item.askedInInterview ? 'unasked' : 'asked'}
            aria-pressed={item.askedInInterview}
          >
            Asked in an interview
          </button>
          <MoreMenu label={`More for ${item.title}`}>
            <PanelButton
              panel={`item-edit:${item.id}`}
              className="more-menu-item"
            >
              Edit
            </PanelButton>
            {!practice && status === 'DONE' && (
              <button className="more-menu-item" name="op" value="reopen">
                Reopen
              </button>
            )}
            {!practice && status === 'IN_PROGRESS' && (
              <button className="more-menu-item" name="op" value="unstart">
                Back to not started
              </button>
            )}
            <button className="more-menu-item danger" name="op" value="remove">
              Remove
            </button>
          </MoreMenu>
        </div>
      </ActionForm>
      <SidePanel id={`item-edit:${item.id}`} title={`Edit ${item.title}`}>
        <ItemForm
          item={item}
          sections={sections}
          onPending={(f) => {
            editedSection.current = String(f.get('section') ?? '').trim();
          }}
          onSettled={followMove}
        />
      </SidePanel>
      {grill && grillable && (
        <SidePanel id={`grill:${item.id}`} title={`Grill me · ${item.title}`}>
          <GrillMe
            item={studyItem}
            budget={grill.budget}
            status={status}
            revisionDue={due}
          />
        </SidePanel>
      )}
      {grill && listenable && (
        <SidePanel id={`listen:${item.id}`} title={`Listen · ${item.title}`}>
          <Listen item={studyItem} budget={grill.budget} />
        </SidePanel>
      )}
    </div>
  );
}
