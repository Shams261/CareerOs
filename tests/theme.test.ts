import { describe, expect, it } from 'vitest';
import { resolveTheme, themeColor } from '../src/lib/theme';

describe('explicit theme preference', () => {
  it.each([undefined, '', 'system', 'invalid', 'light'])(
    'defaults %s to Light',
    (value) => {
      expect(resolveTheme(value)).toBe('light');
      expect(themeColor(resolveTheme(value))).toBe('#F6F3EC');
    },
  );
  it('honors an explicit saved Dark preference', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(themeColor(resolveTheme('dark'))).toBe('#14130F');
  });
});
