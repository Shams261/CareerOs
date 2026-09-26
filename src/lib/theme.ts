export const THEME_COOKIE = 'silsila-theme';
export type Theme = 'light' | 'dark';

/** Missing or unrecognized preferences always use the product default. */
export function resolveTheme(value?: string): Theme {
  return value === 'dark' ? 'dark' : 'light';
}
export const themeColor = (theme: Theme) =>
  theme === 'dark' ? '#14130F' : '#F6F3EC';
