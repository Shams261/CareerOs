'use client';
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePanelFocus } from '@/components/side-panel';

/**
 * Log time · Edit as two small toggles sharing one place in a block's modal (WI-068, WI-069).
 * The panel's `focus` ("log" from Log time, "edit" from Reschedule) opens that tab at once;
 * the Details button opens neither.
 */
export function DetailTabs({
  items,
}: {
  items: { key: string; label: string; content: ReactNode }[];
}) {
  const focus = usePanelFocus();
  const [chosen, setChosen] = useState<string | null>(focus);
  const active = items.find((item) => item.key === chosen) ?? null;
  return (
    <div className="row-tabs">
      <div className="disclosure-tabs">
        {items.map((item) => (
          <button
            type="button"
            key={item.key}
            className="disclosure-link"
            aria-expanded={chosen === item.key}
            onClick={() => setChosen(chosen === item.key ? null : item.key)}
          >
            {item.label}
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="disclosure-chevron"
            />
          </button>
        ))}
      </div>
      {active && (
        <div
          className="row-tab-panel"
          data-panel-focus={active.key}
          tabIndex={-1}
          key={active.key}
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
