export const THEME_COOKIE = 'silsila-theme';
export type Theme = 'light' | 'dark';

/** Missing or unrecognized preferences always use the product default. */
export function resolveTheme(value?: string): Theme {
  return value === 'dark' ? 'dark' : 'light';
}
export const themeColor = (theme: Theme) =>
  theme === 'dark' ? '#14130F' : '#F6F3EC';

/** Text size (WI-087): the whole app scaled a step up for large screens, kept per browser. */
export const TEXT_SIZE_COOKIE = 'silsila-text-size';
export const TEXT_SIZES = ['default', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export function resolveTextSize(value?: string): TextSize {
  return value === 'large' || value === 'larger' ? value : 'default';
}
/** The scale each size applies: 100 %, 112 % and 125 %. */
export const textZoom = (size: TextSize) =>
  size === 'larger' ? 1.25 : size === 'large' ? 1.12 : 1;
export const textSizeLabel = (size: TextSize) =>
  size === 'larger' ? 'Larger' : size === 'large' ? 'Large' : 'Default';
