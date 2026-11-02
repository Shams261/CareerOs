/**
 * Rumi's poses (WI-111): the owner's own Gemini renders of Rumi, cut out on the Mac (Vision's
 * subject lift) and kept as webp in `public/mascot/`. A still image cannot move, so motion is
 * CSS on top: each pose breathes, sways, bobs, floats or sleeps, and a pose whose eyes are open
 * ovals blinks through two eyelids placed over its eyes (`lids`, in percent of the image, in
 * the visor's own colour next to each eye). Covered by tests/agent-mascot.test.ts.
 */
type Motion = 'breathe' | 'sway' | 'bob' | 'float' | 'sleep';
export type Lid = { x: number; y: number; w: number; h: number; c: string };
export type PoseInfo = {
  w: number;
  h: number;
  motion: Motion;
  lids: readonly Lid[];
};

export const POSES = {
  calendar: {
    w: 480,
    h: 387,
    motion: 'breathe',
    lids: [
      { x: 20.21, y: 29.46, w: 5.62, h: 9.56, c: '#465953' },
      { x: 36.04, y: 29.46, w: 5.42, h: 9.3, c: '#4f605c' },
    ],
  },
  checklist: {
    w: 353,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 32.58, y: 29.38, w: 8.5, h: 9.17, c: '#466057' },
      { x: 58.92, y: 29.38, w: 8.5, h: 9.17, c: '#4f655e' },
    ],
  },
  cheering: { w: 397, h: 480, motion: 'sway', lids: [] },
  'goal-flag': {
    w: 480,
    h: 470,
    motion: 'breathe',
    lids: [
      { x: 23.54, y: 28.94, w: 6.25, h: 9.15, c: '#4a6360' },
      { x: 42.71, y: 28.94, w: 6.25, h: 9.15, c: '#4f6966' },
    ],
  },
  head: { w: 419, h: 480, motion: 'breathe', lids: [] },
  'head-open': {
    w: 457,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 32.39, y: 37.92, w: 8.53, h: 11.67, c: '#48625b' },
      { x: 59.08, y: 38.12, w: 8.32, h: 11.46, c: '#506862' },
    ],
  },
  'heading-out': {
    w: 324,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 43.52, y: 27.29, w: 9.88, h: 9.58, c: '#526464' },
      { x: 69.75, y: 27.71, w: 8.95, h: 9.17, c: '#5a6567' },
    ],
  },
  hello: { w: 385, h: 480, motion: 'sway', lids: [] },
  'high-five': { w: 366, h: 480, motion: 'sway', lids: [] },
  idea: {
    w: 395,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 40.0, y: 28.96, w: 7.59, h: 9.17, c: '#416059' },
      { x: 63.29, y: 29.17, w: 7.85, h: 9.17, c: '#4c635e' },
    ],
  },
  'interview-ready': {
    w: 348,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 32.18, y: 28.54, w: 8.91, h: 9.38, c: '#475b57' },
      { x: 58.91, y: 28.54, w: 8.91, h: 9.38, c: '#50625f' },
    ],
  },
  listening: { w: 376, h: 480, motion: 'bob', lids: [] },
  meditating: { w: 351, h: 480, motion: 'float', lids: [] },
  'mock-interview': {
    w: 353,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 32.58, y: 29.17, w: 8.5, h: 9.17, c: '#476460' },
      { x: 58.92, y: 29.17, w: 8.78, h: 9.17, c: '#4f6663' },
    ],
  },
  'morning-coffee': { w: 353, h: 480, motion: 'breathe', lids: [] },
  reading: {
    w: 343,
    h: 480,
    motion: 'bob',
    lids: [
      { x: 38.48, y: 32.71, w: 9.91, h: 9.38, c: '#52615f' },
      { x: 64.72, y: 32.71, w: 9.33, h: 9.17, c: '#5c6262' },
    ],
  },
  'revision-cards': { w: 342, h: 480, motion: 'breathe', lids: [] },
  sitting: {
    w: 368,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 32.61, y: 30.0, w: 8.7, h: 9.58, c: '#49615a' },
      { x: 58.97, y: 30.0, w: 8.7, h: 9.38, c: '#506761' },
    ],
  },
  sleeping: { w: 480, h: 416, motion: 'sleep', lids: [] },
  speaking: {
    w: 386,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 32.38, y: 28.54, w: 8.29, h: 9.58, c: '#46605c' },
      { x: 57.51, y: 28.54, w: 8.03, h: 9.38, c: '#536561' },
    ],
  },
  standing: {
    w: 356,
    h: 480,
    motion: 'breathe',
    lids: [
      { x: 32.58, y: 29.17, w: 8.71, h: 9.17, c: '#455e57' },
      { x: 58.71, y: 29.17, w: 8.71, h: 9.17, c: '#4c605b' },
    ],
  },
  'stretch-break': { w: 431, h: 480, motion: 'breathe', lids: [] },
  thinking: {
    w: 366,
    h: 480,
    motion: 'bob',
    lids: [
      { x: 32.51, y: 29.79, w: 8.74, h: 9.38, c: '#48615a' },
      { x: 58.74, y: 30.0, w: 8.74, h: 9.17, c: '#506760' },
    ],
  },
  working: {
    w: 384,
    h: 480,
    motion: 'bob',
    lids: [
      { x: 43.75, y: 34.58, w: 9.11, h: 10.0, c: '#5a6566' },
      { x: 65.36, y: 35.0, w: 7.03, h: 9.58, c: '#5f6869' },
    ],
  },
  writing: {
    w: 348,
    h: 480,
    motion: 'bob',
    lids: [
      { x: 45.11, y: 34.58, w: 9.77, h: 9.79, c: '#5d6666' },
      { x: 68.68, y: 34.17, w: 7.76, h: 9.38, c: '#666669' },
    ],
  },
} as const satisfies Record<string, PoseInfo>;
export type Pose = keyof typeof POSES;

/**
 * Bumped whenever a picture changes (WI-115): the files are cached for a year, so a new
 * version in the path is how a changed picture reaches the browser.
 */
const MASCOT_VERSION = 1;
/** Where a pose's file is served from. */
export const poseSrc = (pose: Pose) =>
  `/mascot/${pose}.webp?v=${MASCOT_VERSION}`;
/** The small heads used by the icon: eyes open, and the happy arcs shown on hover. */
export const HEAD_SRC = {
  open: `/mascot/head-open-sm.webp?v=${MASCOT_VERSION}`,
  happy: `/mascot/head-sm.webp?v=${MASCOT_VERSION}`,
} as const;
/** A blink's place in the cycle differs per pose, so two Rumis on a page never blink together. */
export const blinkDelay = (pose: string) =>
  ([...pose].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 997, 7) % 50) / 10;
