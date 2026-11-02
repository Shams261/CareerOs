/**
 * Block categories are free text ("System Design", "system-design" and SYSTEM_DESIGN match).
 * These rules are shared by Today, Plan, the review, Rumi, nudges and the calendar, so they
 * live here rather than in any one feature (WI-123).
 */
export const categoryKey = (c: string) =>
  c
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
export const isDsa = (category: string) =>
  category.trim().toUpperCase() === 'DSA';
export const isTechnical = (s: string) =>
  ['TECHNICAL', 'SYSTEM_DESIGN'].includes(categoryKey(s));
const ACRONYMS = new Set(['DSA', 'API', 'AWS', 'SQL', 'OA']);
/** A category key as words: DSA stays DSA, JOB_SEARCH reads "Job search". */
export const categoryLabel = (key: string) => {
  // Known acronyms stay upper-case (DSA); other keys read as words (JOB_SEARCH → Job search).
  if (ACRONYMS.has(key)) return key;
  const t = key.toLowerCase().replaceAll('_', ' ');
  return t[0].toUpperCase() + t.slice(1);
};
/** Groups used for planned-vs-actual. Other categories keep their own label. */
export function categoryGroup(category: string) {
  const key = categoryKey(category);
  if (isDsa(key)) return 'DSA';
  if (isTechnical(key)) return 'Technical';
  if (['JOB_SEARCH', 'INTERVIEW'].includes(key)) return 'Job search';
  return categoryLabel(key);
}
/** A block or session counts as study when its category (or its group) is chosen. */
export function isStudyCategory(category: string, chosen: string[]) {
  const wanted = new Set(chosen.map(categoryKey));
  return (
    wanted.has(categoryKey(category)) ||
    wanted.has(categoryKey(categoryGroup(category)))
  );
}
