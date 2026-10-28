'use client';
import { useState } from 'react';
import type { RoutineTemplate } from './templates';

/**
 * Template chips above the routine form (WI-059). A chip fills the form's title, days, times
 * and category; the owner can change any of it, and nothing is saved until Add routine.
 */
export function TemplateChips({ templates }: { templates: RoutineTemplate[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  if (!templates.length) return null;
  const fill = (button: HTMLElement, t: RoutineTemplate) => {
    const form = button.closest('form');
    if (!form) return;
    const set = (name: string, value: string) => {
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    set('title', t.title);
    set('startLocal', t.startLocal);
    set('endLocal', t.endLocal);
    set('category', t.category);
    form
      .querySelectorAll<HTMLInputElement>('input[name="weekdays"]')
      .forEach((box) => {
        box.checked = t.weekdays.includes(Number(box.value));
      });
    setPicked(t.key);
  };
  return (
    <div
      className="template-chips"
      role="group"
      aria-label="Start from a template"
    >
      {templates.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`template-chip${picked === t.key ? ' is-on' : ''}`}
          aria-pressed={picked === t.key}
          onClick={(e) => fill(e.currentTarget, t)}
        >
          {t.title}
        </button>
      ))}
    </div>
  );
}
