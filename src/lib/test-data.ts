/**
 * Test- and UAT-named records (R1, Version 2 plan). Records named the way test data is
 * written are kept out of Study Nudges and AI context until the owner cleans them up, so a
 * leftover "TEST routine" never becomes a reminder or a model input.
 *
 * Ordinary words are not enough: "run the failing test first" is curriculum. A name reads as
 * test data when it carries a marker in capitals (TEST, DEMO, DUMMY, SAMPLE), the word UAT in
 * any case, a marker in brackets ("(demo)", "[test]"), or is only a marker ("test", "Test 2").
 */
const MARKERS: RegExp[] = [
  /\b(TEST|DEMO|DUMMY|SAMPLE)\b/,
  /\buat\b/i,
  /[([]\s*(test|demo|dummy|sample|uat)\s*[)\]]/i,
  /^\s*(test|demo|dummy|sample)(\s*\d+)?\s*$/i,
];

/** True when any of the given names reads as test data. Empty values never match. */
export const isTestNamed = (...names: (string | null | undefined)[]) =>
  names.some((name) => !!name && MARKERS.some((m) => m.test(name)));
