import { ActionForm } from '@/components/action-form';
import type { Goal, Roadmap, RoadmapItem } from '@/generated/prisma/client';
import {
  DEFAULT_PROMPT_TEMPLATE,
  referenceLines,
  scenarioLines,
  type Reference,
  type Scenario,
} from './domain';
import {
  bulkItemsAction,
  goalAction,
  itemAction,
  itemOpAction,
  roadmapAction,
} from './actions';

export type LinkOption = { value: string; label: string };
const GOAL_CATEGORIES = [
  'Career',
  'DSA',
  'System design',
  'Technical',
  'Fitness',
  'Personal',
  'Other',
];

/** `compact` is the first-run form: a title and a target date. */
export function GoalForm({
  goal,
  compact = false,
}: {
  goal?: Goal;
  compact?: boolean;
}) {
  const target = goal?.targetDate?.toISOString().slice(0, 10) ?? '';
  return (
    <ActionForm
      action={goalAction}
      label={goal ? `Edit goal ${goal.title}` : 'Add goal'}
      className="dsa-form"
      resetOnSuccess={!goal}
    >
      <input type="hidden" name="id" value={goal?.id ?? ''} />
      <div className="form-grid">
        <label>
          Goal
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={goal?.title}
            placeholder="Offer from a product company"
          />
        </label>
        <label>
          Target date
          <input name="targetDate" type="date" defaultValue={target} />
        </label>
        <label>
          Category
          <input
            name="category"
            required
            maxLength={80}
            list="goal-categories"
            defaultValue={goal?.category ?? 'Career'}
          />
        </label>
        {!compact && (
          <>
            <label>
              Status
              <select name="status" defaultValue={goal?.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={goal?.priority ?? 2}>
                <option value={1}>High</option>
                <option value={2}>Normal</option>
                <option value={3}>Low</option>
              </select>
            </label>
          </>
        )}
      </div>
      {!compact && (
        <label>
          Why it matters
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={goal?.description ?? ''}
          />
        </label>
      )}
      <datalist id="goal-categories">
        {GOAL_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <button className="button">{goal ? 'Save goal' : 'Add goal'}</button>
    </ActionForm>
  );
}

export function RoadmapForm({
  roadmap,
  goals,
}: {
  roadmap?: Roadmap;
  goals: { id: string; title: string }[];
}) {
  return (
    <ActionForm
      action={roadmapAction}
      label={roadmap ? `Edit roadmap ${roadmap.title}` : 'New roadmap'}
      className="dsa-form"
      resetOnSuccess={!roadmap}
    >
      <input type="hidden" name="id" value={roadmap?.id ?? ''} />
      <div className="form-grid">
        <label>
          Title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={roadmap?.title}
            placeholder="Technical interview roadmap"
          />
        </label>
        <label>
          Goal
          <select name="goalId" defaultValue={roadmap?.goalId ?? ''}>
            <option value="">No goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea
          name="description"
          maxLength={1000}
          defaultValue={roadmap?.description ?? ''}
        />
      </label>
      {roadmap && (
        <>
          <label>
            Study prompt template
            <textarea
              name="promptTemplate"
              rows={8}
              maxLength={20000}
              defaultValue={roadmap.promptTemplate ?? ''}
              placeholder={DEFAULT_PROMPT_TEMPLATE.slice(0, 160) + '…'}
            />
          </label>
          <p className="muted">
            Leave empty for the built-in template. Placeholders:{' '}
            {
              '{{topic}} {{section}} {{roadmap}} {{scope}} {{checkpoint}} {{priority}} {{estimate}} {{references}} {{notes}} {{scenario}} {{extra}}'
            }
          </p>
          <label>
            Scenarios, one per line as <code>id | Name | instruction</code>
            <textarea
              name="scenarios"
              rows={5}
              maxLength={20000}
              defaultValue={scenarioLines(
                (roadmap.scenarios as Scenario[] | null) ?? [],
              )}
              placeholder="start | Start or continue | Teach this topic directly…"
            />
          </label>
          <p className="muted">Leave empty for the built-in scenarios.</p>
          <label className="check">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={!!roadmap.archivedAt}
            />
            Archived
          </label>
        </>
      )}
      <button className="button">
        {roadmap ? 'Save roadmap' : 'Create roadmap'}
      </button>
    </ActionForm>
  );
}

/** Paste an outline: one item per line, `?` marks a question. */
export function BulkItemsForm({
  roadmapId,
  sections,
  section,
}: {
  roadmapId: string;
  sections: string[];
  section?: string;
}) {
  return (
    <ActionForm
      action={bulkItemsAction}
      label="Add items"
      className="dsa-form"
      resetOnSuccess
    >
      <input type="hidden" name="roadmapId" value={roadmapId} />
      <label>
        Section
        <input
          name="section"
          required
          maxLength={120}
          list={`sections-${roadmapId}`}
          defaultValue={section ?? ''}
          placeholder="System design"
        />
      </label>
      <datalist id={`sections-${roadmapId}`}>
        {sections.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <label>
        Items, one per line
        <textarea
          name="lines"
          required
          rows={6}
          maxLength={20000}
          placeholder={
            'Consistent hashing\n? Design a URL shortener\nCAP theorem'
          }
        />
      </label>
      <p className="muted">Start a line with ? to mark a question.</p>
      <button className="button">Add items</button>
    </ActionForm>
  );
}

export function ItemForm({
  item,
  sections,
  links,
}: {
  item: RoadmapItem;
  sections: string[];
  links: LinkOption[];
}) {
  const current = item.learningTopicId
    ? `learning:${item.learningTopicId}`
    : item.dsaTopicId
      ? `dsa-topic:${item.dsaTopicId}`
      : item.dsaProblemId
        ? `problem:${item.dsaProblemId}`
        : '';
  return (
    <ActionForm
      action={itemAction}
      label={`Edit ${item.title}`}
      className="dsa-form"
    >
      <input type="hidden" name="id" value={item.id} />
      <div className="form-grid">
        <label>
          Title
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={item.title}
          />
        </label>
        <label>
          Section
          <input
            name="section"
            required
            maxLength={120}
            list={`sections-edit-${item.roadmapId}`}
            defaultValue={item.section}
          />
        </label>
        <label>
          Kind
          <select name="kind" defaultValue={item.kind}>
            <option value="CONCEPT">Concept</option>
            <option value="QUESTION">Question</option>
          </select>
        </label>
        <label>
          Linked to
          <select name="link" defaultValue={current}>
            <option value="">Nothing</option>
            {links.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select name="priority" defaultValue={item.priority}>
            <option value={1}>P0 · first</option>
            <option value={2}>P1 · important</option>
            <option value={3}>P2 · later</option>
          </select>
        </label>
        <label>
          Estimate (minutes)
          <input
            name="estimateMinutes"
            type="number"
            min={1}
            max={6000}
            defaultValue={item.estimateMinutes ?? ''}
          />
        </label>
        <label>
          Link (optional)
          <input name="url" type="url" defaultValue={item.url ?? ''} />
        </label>
        <label>
          Where it came up (optional)
          <input
            name="askedNote"
            maxLength={200}
            defaultValue={item.askedNote ?? ''}
            placeholder="Amazon phone screen"
          />
        </label>
        <label>
          Revise on (clear to stop)
          <input
            name="nextRevisionAt"
            type="date"
            defaultValue={item.nextRevisionAt?.toISOString().slice(0, 10) ?? ''}
          />
        </label>
      </div>
      <datalist id={`sections-edit-${item.roadmapId}`}>
        {sections.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <label>
        Scope: what to cover
        <textarea
          name="scope"
          rows={3}
          maxLength={8000}
          defaultValue={item.scope ?? ''}
        />
      </label>
      <label>
        Checkpoint: what done means
        <textarea
          name="checkpoint"
          rows={2}
          maxLength={4000}
          defaultValue={item.checkpoint ?? ''}
        />
      </label>
      <label>
        References, one per line as <code>Label | https://url</code>
        <textarea
          name="references"
          rows={3}
          maxLength={20000}
          defaultValue={referenceLines(
            (item.references as Reference[] | null) ?? [],
          )}
        />
      </label>
      <label>
        Notes for revision (links are fine)
        <textarea
          name="notes"
          rows={6}
          maxLength={20000}
          defaultValue={item.notes ?? ''}
        />
      </label>
      {item.sourceRef && (
        <p className="muted">Imported from: {item.sourceRef}</p>
      )}
      <button className="button">Save item</button>
    </ActionForm>
  );
}

/** Status and interview marks on one row. */
export function ItemControls({
  item,
}: {
  item: Pick<
    RoadmapItem,
    'id' | 'title' | 'status' | 'askedInInterview' | 'nextRevisionAt'
  >;
}) {
  return (
    <ActionForm action={itemOpAction} label={`Actions for ${item.title}`}>
      <input type="hidden" name="id" value={item.id} />
      <div className="actions item-actions">
        {item.status === 'NOT_STARTED' && (
          <button className="button secondary" name="op" value="start">
            Start
          </button>
        )}
        {item.status !== 'DONE' ? (
          <button className="button" name="op" value="done">
            Done
          </button>
        ) : (
          <>
            {item.nextRevisionAt && (
              <button className="button" name="op" value="revised">
                Revised
              </button>
            )}
            <button className="button secondary" name="op" value="reopen">
              Reopen
            </button>
          </>
        )}
        <button
          className="button secondary"
          name="op"
          value={item.askedInInterview ? 'unasked' : 'asked'}
          aria-pressed={item.askedInInterview}
        >
          {item.askedInInterview ? 'Asked ✓' : 'Asked in interview'}
        </button>
        <button
          className="button secondary"
          name="op"
          value="remove"
          aria-label={`Remove ${item.title}`}
        >
          Remove
        </button>
      </div>
    </ActionForm>
  );
}
