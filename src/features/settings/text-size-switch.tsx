'use client';
import { saveTextSize } from '@/features/theme-actions';
import { TEXT_SIZES, textSizeLabel, type TextSize } from '@/lib/theme';

/** Default / Large / Larger as radios that save as soon as one is chosen (WI-087). */
export function TextSizeSwitch({ size }: { size: TextSize }) {
  return (
    <form action={saveTextSize} className="theme-switch" aria-label="Text size">
      {TEXT_SIZES.map((value) => (
        <label key={value} className={size === value ? 'is-on' : ''}>
          <input
            type="radio"
            name="size"
            value={value}
            defaultChecked={size === value}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
          {textSizeLabel(value)}
        </label>
      ))}
      <noscript>
        <button className="button secondary small">Save</button>
      </noscript>
    </form>
  );
}
