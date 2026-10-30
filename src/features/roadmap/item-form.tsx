'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import type { RoadmapItem } from '@/generated/prisma/client';
import { referenceLines, type Reference } from './domain';
import { itemAction } from './actions';
import type { LinkOption } from './forms';
import { Button } from '@/components/ui/button';

/**
 * The per-item edit form is a client component so a closed form costs the page only its
 * props: with a few hundred items, rendering every form on the server (each with the full
 * link picker) made the roadmap page tens of megabytes. The link options are provided once.
 */
const LinkOptions = createContext<LinkOption[]>([]);
export function LinkOptionsProvider({
  links,
  children,
}: {
  links: LinkOption[];
  children: ReactNode;
}) {
  return <LinkOptions.Provider value={links}>{children}</LinkOptions.Provider>;
}

export function ItemForm({
  item,
  sections,
  onPending,
  onSettled,
}: {
  item: RoadmapItem;
  sections: string[];
  /** Passed through to the form, so the page can follow an item moved to another week (WI-089). */
  onPending?: (form: FormData) => void;
  onSettled?: (result: { ok?: boolean }) => void;
}) {
  const links = useContext(LinkOptions);
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
      onPending={onPending}
      onSettled={onSettled}
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
        {/* A problem item's revision date is the problem's, set in Practice (WI-046). */}
        {!item.dsaProblemId && (
          <label>
            Revise on (clear to stop)
            <input
              name="nextRevisionAt"
              type="date"
              defaultValue={
                item.nextRevisionAt?.toISOString().slice(0, 10) ?? ''
              }
            />
          </label>
        )}
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
      <Button>Save item</Button>
    </ActionForm>
  );
}
