import { ActionForm } from '@/components/action-form';
import type { Goal, Roadmap } from '@/generated/prisma/client';
import {
  DEFAULT_PROMPT_TEMPLATE,
  scenarioLines,
  type Scenario,
} from './domain';
import { bulkItemsAction, goalAction, roadmapAction } from './actions';
import { Button } from '@/components/ui/button';

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
      <Button>{goal ? 'Save goal' : 'Add goal'}</Button>
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
            Study prompt template (empty = built-in; placeholders{' '}
            {
              '{{topic}} {{section}} {{scope}} {{checkpoint}} {{priority}} {{references}} {{notes}} {{scenario}} {{extra}}'
            }
            )
            <textarea
              name="promptTemplate"
              rows={8}
              maxLength={20000}
              defaultValue={roadmap.promptTemplate ?? ''}
              placeholder={DEFAULT_PROMPT_TEMPLATE.slice(0, 160) + '…'}
            />
          </label>
          <label>
            Scenarios, one per line as <code>id | Name | instruction</code>{' '}
            (empty = built-in)
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
      <Button>{roadmap ? 'Save roadmap' : 'Create roadmap'}</Button>
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
        Items, one per line (start a line with ? for a question)
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
      <Button>Add items</Button>
    </ActionForm>
  );
}
