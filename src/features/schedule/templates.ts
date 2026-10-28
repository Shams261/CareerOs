/**
 * Routine templates (WI-059): the weekly interview mix as starting points. A chip only fills
 * the routine form; nothing is saved until Add routine. Weekdays are 0 (Sunday) to 6.
 */
export type RoutineTemplate = {
  key: string;
  title: string;
  category: string;
  weekdays: number[];
  startLocal: string;
  endLocal: string;
};

export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  {
    key: 'dsa',
    title: 'DSA practice',
    category: 'DSA',
    weekdays: [1, 2, 3, 4, 5],
    startLocal: '07:30',
    endLocal: '09:00',
  },
  {
    key: 'system-design',
    title: 'System design',
    category: 'SYSTEM_DESIGN',
    weekdays: [2, 4],
    startLocal: '20:00',
    endLocal: '21:00',
  },
  {
    key: 'code-review',
    title: 'Code review and bug squash',
    category: 'TECHNICAL',
    weekdays: [6],
    startLocal: '10:00',
    endLocal: '11:30',
  },
  {
    key: 'behavioural',
    title: 'Behavioural stories',
    category: 'TECHNICAL',
    weekdays: [0],
    startLocal: '10:00',
    endLocal: '11:00',
  },
  {
    key: 'job-search',
    title: 'Job search',
    category: 'JOB_SEARCH',
    weekdays: [1, 3, 5],
    startLocal: '12:30',
    endLocal: '13:15',
  },
];

/** Categories a template owns alone: a routine of that category already covers it. */
const OWN_CATEGORY = new Set(['DSA', 'SYSTEM_DESIGN', 'JOB_SEARCH']);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The templates the owner does not have yet: a routine with the same title, or (for DSA,
 * System design and Job search) the same category, hides its chip.
 */
export function openTemplates(routines: { title: string; category: string }[]) {
  return ROUTINE_TEMPLATES.filter(
    (t) =>
      !routines.some(
        (r) =>
          norm(r.title) === norm(t.title) ||
          (OWN_CATEGORY.has(t.category) &&
            r.category.trim().toUpperCase() === t.category),
      ),
  );
}
