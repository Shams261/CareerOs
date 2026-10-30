import { describe, expect, it } from 'vitest';
import {
  resolveTextSize,
  resolveTheme,
  textSizeLabel,
  textZoom,
  themeColor,
} from '../src/lib/theme';

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

describe('text size (WI-087)', () => {
  it.each([undefined, '', 'huge', 'default'])('defaults %s', (value) => {
    expect(resolveTextSize(value)).toBe('default');
    expect(textZoom(resolveTextSize(value))).toBe(1);
  });
  it('steps up for Large and Larger', () => {
    expect(textZoom(resolveTextSize('large'))).toBe(1.12);
    expect(textZoom(resolveTextSize('larger'))).toBe(1.25);
    expect(textSizeLabel('larger')).toBe('Larger');
  });
});
