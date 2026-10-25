/**
 * Watch It Run (WI-030): four patterns traced by Silsila's own code on a small input, one
 * step at a time with a line of narration from a template. No model is involved, so every
 * step is exactly what the algorithm does. Pure; each tracer's answer is checked against a
 * brute force in tests/drills-trace.test.ts.
 */

export type TraceKind =
  'two-pointers' | 'sliding-window' | 'binary-search' | 'monotonic-stack';
export const MAX_INPUT = 12;

export type Step = {
  /** Named positions to mark on the cells ("L", "R", "i", "mid"). */
  marks: Record<string, number>;
  /** Cells inside the current window or range. */
  range?: [number, number];
  /** Indices on the stack, bottom first (monotonic stack). */
  stack?: number[];
  /** What is known so far, as short facts ("best 49"). */
  facts: string[];
  narration: string;
};
export type Trace = {
  kind: TraceKind;
  title: string;
  input: number[];
  target?: number;
  steps: Step[];
  answer: string;
};

export const TRACES: Record<
  TraceKind,
  { title: string; question: string; sample: number[]; target?: number }
> = {
  'two-pointers': {
    title: 'Two pointers',
    question: 'Container With Most Water: the largest area between two lines.',
    sample: [1, 8, 6, 2, 5, 4, 8, 3, 7],
  },
  'sliding-window': {
    title: 'Sliding window',
    question: 'The longest run of numbers with no repeat.',
    sample: [3, 1, 4, 1, 5, 9, 2, 6, 5],
  },
  'binary-search': {
    title: 'Binary search',
    question: 'The first position whose number is at least the target.',
    sample: [1, 3, 4, 7, 9, 12, 15, 18],
    target: 10,
  },
  'monotonic-stack': {
    title: 'Monotonic stack',
    question: 'For each number, the next greater number to its right.',
    sample: [2, 1, 5, 3, 4, 6, 2],
  },
};

/** Which tracer a Practice topic gets, by its name; null for the other patterns. */
export function traceForTopic(name: string): TraceKind | null {
  const n = name.toLowerCase();
  if (n.includes('two pointer')) return 'two-pointers';
  if (n.includes('sliding window')) return 'sliding-window';
  if (n.includes('binary search')) return 'binary-search';
  if (n.includes('monotonic') || n === 'stack & monotonic stack')
    return 'monotonic-stack';
  return null;
}

/**
 * Reads "3, 1, 4" typed by the owner: up to twelve whole numbers from -99 to 99. Binary
 * search sorts them, since the pattern needs sorted input.
 */
export function parseInput(text: string, kind: TraceKind) {
  const parts = text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return { error: 'Type a few numbers, like 3, 1, 4.' };
  if (parts.length > MAX_INPUT) return { error: `Up to ${MAX_INPUT} numbers.` };
  const values = parts.map(Number);
  if (values.some((v) => !Number.isInteger(v) || v < -99 || v > 99))
    return { error: 'Whole numbers from -99 to 99 only.' };
  if (kind === 'two-pointers' && values.some((v) => v < 0))
    return { error: 'Heights cannot be negative.' };
  if (kind === 'two-pointers' && values.length < 2)
    return { error: 'At least two heights.' };
  return {
    values:
      kind === 'binary-search' ? [...values].sort((a, b) => a - b) : values,
  };
}

export function trace(kind: TraceKind, input: number[], target = 0): Trace {
  const title = TRACES[kind].title;
  switch (kind) {
    case 'two-pointers':
      return { kind, title, input, ...twoPointers(input) };
    case 'sliding-window':
      return { kind, title, input, ...slidingWindow(input) };
    case 'binary-search':
      return { kind, title, input, target, ...binarySearch(input, target) };
    case 'monotonic-stack':
      return { kind, title, input, ...monotonicStack(input) };
  }
}

function twoPointers(h: number[]) {
  const steps: Step[] = [];
  let l = 0,
    r = h.length - 1,
    best = 0;
  steps.push({
    marks: { L: l, R: r },
    range: [l, r],
    facts: ['best 0'],
    narration: 'Start with the widest pair: one pointer at each end.',
  });
  while (l < r) {
    const area = (r - l) * Math.min(h[l], h[r]);
    const better = area > best;
    best = Math.max(best, area);
    const moveLeft = h[l] <= h[r];
    steps.push({
      marks: { L: l, R: r },
      range: [l, r],
      facts: [`area ${area}`, `best ${best}`],
      narration: `Width ${r - l} × shorter height ${Math.min(h[l], h[r])} = ${area}${better ? ', the best so far' : ''}. Move the shorter side${moveLeft ? ' (left)' : ' (right)'} inward: only a taller line can do better.`,
    });
    if (moveLeft) l++;
    else r--;
  }
  steps.push({
    marks: {},
    facts: [`best ${best}`],
    narration: `The pointers met. The largest area is ${best}.`,
  });
  return { steps, answer: String(best) };
}

function slidingWindow(a: number[]) {
  const steps: Step[] = [];
  const last = new Map<number, number>();
  let start = 0,
    best = 0,
    bestAt: [number, number] = [0, -1];
  for (let i = 0; i < a.length; i++) {
    const seen = last.get(a[i]);
    let note = '';
    if (seen !== undefined && seen >= start) {
      note = `${a[i]} is already in the window, so the left edge jumps past it to ${seen + 1}. `;
      start = seen + 1;
    }
    last.set(a[i], i);
    const length = i - start + 1;
    if (length > best) {
      best = length;
      bestAt = [start, i];
    }
    steps.push({
      marks: { L: start, R: i },
      range: [start, i],
      facts: [`window ${length}`, `best ${best}`],
      narration: `${note}Add ${a[i]}. The window holds ${length} number${length === 1 ? '' : 's'} with no repeat${length === best ? '; the longest so far' : ''}.`,
    });
  }
  steps.push({
    marks: {},
    range: bestAt[1] >= 0 ? bestAt : undefined,
    facts: [`best ${best}`],
    narration: `Every number was added once. The longest run without a repeat has ${best}.`,
  });
  return { steps, answer: String(best) };
}

function binarySearch(a: number[], target: number) {
  const steps: Step[] = [];
  let lo = 0,
    hi = a.length;
  steps.push({
    marks: {},
    range: a.length ? [lo, hi - 1] : undefined,
    facts: [`target ${target}`],
    narration: `The answer is somewhere in positions ${lo} to ${hi}: the end counts as "none".`,
  });
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const yes = a[mid] >= target;
    steps.push({
      marks: { mid },
      range: [lo, hi - 1],
      facts: [`target ${target}`],
      narration: `Middle is position ${mid} with ${a[mid]}. ${a[mid]} ${yes ? '≥' : '<'} ${target}, so the first match is ${yes ? `at ${mid} or to its left` : 'to its right'}.`,
    });
    if (yes) hi = mid;
    else lo = mid + 1;
  }
  steps.push({
    marks: lo < a.length ? { first: lo } : {},
    facts: [`target ${target}`],
    narration:
      lo < a.length
        ? `The range closed at position ${lo}: ${a[lo]} is the first number at least ${target}.`
        : `The range closed past the end: no number is at least ${target}.`,
  });
  return { steps, answer: String(lo) };
}

function monotonicStack(a: number[]) {
  const steps: Step[] = [];
  const next = a.map(() => -1);
  const stack: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const popped: number[] = [];
    while (stack.length && a[stack[stack.length - 1]] < a[i]) {
      const j = stack.pop()!;
      next[j] = a[i];
      popped.push(a[j]);
    }
    stack.push(i);
    steps.push({
      marks: { i },
      stack: [...stack],
      facts: [`answers ${next.map((v) => (v < 0 ? '·' : v)).join(' ')}`],
      narration: popped.length
        ? `${a[i]} is greater than ${popped.join(', ')} on the stack, so it is their next greater number. Push ${a[i]}.`
        : `Nothing on the stack is smaller than ${a[i]}. Push it and wait for something greater.`,
    });
  }
  steps.push({
    marks: {},
    stack: [...stack],
    facts: [`answers ${next.join(' ')}`],
    narration: stack.length
      ? `What is left on the stack has nothing greater to its right: -1.`
      : 'Every number found its next greater number.',
  });
  return { steps, answer: next.join(' ') };
}

/** Brute forces the tests compare against. */
export const bruteForce: Record<
  TraceKind,
  (a: number[], target?: number) => string
> = {
  'two-pointers': (h) => {
    let best = 0;
    for (let i = 0; i < h.length; i++)
      for (let j = i + 1; j < h.length; j++)
        best = Math.max(best, (j - i) * Math.min(h[i], h[j]));
    return String(best);
  },
  'sliding-window': (a) => {
    let best = 0;
    for (let i = 0; i < a.length; i++)
      for (let j = i; j < a.length; j++) {
        if (new Set(a.slice(i, j + 1)).size !== j - i + 1) break;
        best = Math.max(best, j - i + 1);
      }
    return String(best);
  },
  'binary-search': (a, target = 0) => {
    const i = a.findIndex((v) => v >= target);
    return String(i < 0 ? a.length : i);
  },
  'monotonic-stack': (a) =>
    a.map((v, i) => a.slice(i + 1).find((w) => w > v) ?? -1).join(' '),
};
