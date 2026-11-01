import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isRumiKey } from '../src/features/agent/events';
import {
  blinkDelay,
  HEAD_SRC,
  POSES,
  poseSrc,
  type Pose,
} from '../src/features/agent/mascot';
import { RumiMark } from '../src/features/agent/mark';
import { RumiPose } from '../src/features/agent/pose';

const PUBLIC = join(__dirname, '..', 'public');
/** A served path without its version (WI-115). */
const file = (src: string) => join(PUBLIC, src.split('?')[0]);
/** A webp with alpha starts with a VP8X chunk holding the canvas size (each less one, 24 bits). */
function webpSize(file: string) {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  expect(b.toString('ascii', 12, 16)).toBe('VP8X');
  return {
    w: 1 + b.readUIntLE(24, 3),
    h: 1 + b.readUIntLE(27, 3),
    alpha: (b[20] & 0x10) !== 0,
  };
}
const key = (k: string, mods: Partial<Record<string, boolean>> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("Rumi's poses (WI-111)", () => {
  it('serves every pose as a cut-out webp of the size the manifest says', () => {
    for (const pose of Object.keys(POSES) as Pose[]) {
      const path = file(poseSrc(pose));
      expect(existsSync(path), pose).toBe(true);
      const size = webpSize(path);
      expect(size, pose).toEqual({
        w: POSES[pose].w,
        h: POSES[pose].h,
        alpha: true,
      });
      // Small enough to load on a page that shows it.
      expect(readFileSync(path).length, pose).toBeLessThan(40_000);
    }
    for (const src of Object.values(HEAD_SRC))
      expect(existsSync(file(src))).toBe(true);
  });
  it('keeps nothing in the folder that the manifest does not name', () => {
    const named = new Set([
      ...Object.keys(POSES).map((p) => `${p}.webp`),
      ...Object.values(HEAD_SRC).map((s) => s.split('?')[0].split('/').pop()),
    ]);
    for (const f of readdirSync(join(PUBLIC, 'mascot')))
      expect(named.has(f), f).toBe(true);
  });
  it('places each pair of eyelids inside the image, side by side', () => {
    for (const [pose, info] of Object.entries(POSES)) {
      if (!info.lids.length) continue;
      expect(info.lids, pose).toHaveLength(2);
      for (const l of info.lids) {
        expect(l.x, pose).toBeGreaterThanOrEqual(0);
        expect(l.y, pose).toBeGreaterThanOrEqual(0);
        expect(l.x + l.w, pose).toBeLessThanOrEqual(100);
        expect(l.y + l.h, pose).toBeLessThanOrEqual(100);
        expect(l.c, pose).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(info.lids[0].x, pose).toBeLessThan(info.lids[1].x);
    }
    // The head the icon blinks with has eyes open.
    expect(POSES['head-open'].lids).toHaveLength(2);
  });
  it('gives each pose its own beat, within one cycle', () => {
    const delays = Object.keys(POSES).map(blinkDelay);
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(5);
    }
    expect(new Set(delays).size).toBeGreaterThan(5);
  });
  it('draws a pose as decoration with no name, and the sleeper with its z', () => {
    const html = renderToStaticMarkup(
      createElement(RumiPose, { pose: 'sitting', size: 100 }),
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('alt=""');
    expect(html).toContain('src="/mascot/sitting.webp?v=');
    expect(html).toContain('loading="lazy"');
    // WI-112: the tile is sized from the pose's own width, never from the card around it.
    expect(html).toContain('--pose:100px');
    expect(html).toContain('class="rumi-pose-figure" data-motion="breathe"');
    expect(html.match(/class="rumi-lid"/g)).toHaveLength(2);
    expect(
      renderToStaticMarkup(createElement(RumiPose, { pose: 'sleeping' })),
    ).toContain('rumi-zzz');
    expect(
      renderToStaticMarkup(
        createElement(RumiPose, { pose: 'goal-flag', priority: true }),
      ),
    ).toMatch(
      /loading="eager"[^>]*fetchPriority="high"|fetchPriority="high"[^>]*loading="eager"/,
    );
  });
  it('draws the icon as the head with eyelids, and the × only while open', () => {
    const html = renderToStaticMarkup(createElement(RumiMark, { size: 60 }));
    expect(html).toContain(`src="${HEAD_SRC.open}"`);
    // WI-115: the happy head is fetched only after the pointer comes near.
    expect(html).not.toContain(HEAD_SRC.happy);
    expect(
      renderToStaticMarkup(createElement(RumiMark, { size: 60, happy: true })),
    ).toContain(HEAD_SRC.happy);
    expect(html.match(/class="rumi-lid"/g)).toHaveLength(2);
    expect(html).not.toContain('rumi-mark-badge');
    expect(
      renderToStaticMarkup(
        createElement(RumiMark, { size: 60, closed: true, state: 'busy' }),
      ),
    ).toMatch(/data-state="busy".*rumi-mark-badge/s);
  });
  it('opens Rumi on ⌘/ or Ctrl+/ only', () => {
    expect(isRumiKey(key('/', { metaKey: true }))).toBe(true);
    expect(isRumiKey(key('/', { ctrlKey: true }))).toBe(true);
    expect(isRumiKey(key('/'))).toBe(false);
    expect(isRumiKey(key('/', { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isRumiKey(key('/', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(isRumiKey(key('k', { metaKey: true }))).toBe(false);
  });
});
