'use client';
import { saveTheme } from '@/features/theme-actions';

/** Light / Dark as two radios that save as soon as one is chosen; no Save button. */
export function ThemeSwitch({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <form action={saveTheme} className="theme-switch" aria-label="Theme">
      {(['light', 'dark'] as const).map((value) => (
        <label key={value} className={theme === value ? 'is-on' : ''}>
          <input
            type="radio"
            name="theme"
            value={value}
            defaultChecked={theme === value}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
          {value === 'light' ? 'Light' : 'Dark'}
        </label>
      ))}
      <noscript>
        <button className="button secondary small">Save</button>
      </noscript>
    </form>
  );
}
