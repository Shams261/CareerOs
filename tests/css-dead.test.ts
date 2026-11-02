import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No dead CSS (WI-124): every class a selector in `globals.css` names appears somewhere in the
 * code, or is built from a `prefix-${…}` template. A screen that is removed takes its styles with
 * it; this fails until it does.
 */
const ROOT = process.cwd();
function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'generated') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const code = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'public'))]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const words = new Set(code.match(/[A-Za-z_][\w-]*/g));
const prefixes = [
  ...new Set(
    [
      ...code.matchAll(/([a-z][\w-]*-)\$\{/g),
      ...code.matchAll(/['"`]([a-z][\w-]*-)['"`]\s*\+/g),
    ].map((m) => m[1]),
  ),
];
const alive = (c: string) =>
  words.has(c) || prefixes.some((p) => c.startsWith(p));

describe('globals.css (WI-124)', () => {
  it('names no class the code never uses', () => {
    const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/url\([^)]*\)/g, '');
    const selectors = [...css.matchAll(/([^{};]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((s) => !s.startsWith('@') && !/^(from|to|\d+%)/.test(s));
    const dead = new Set<string>();
    for (const s of selectors)
      for (const m of s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g))
        if (!alive(m[1])) dead.add(m[1]);
    expect([...dead].sort()).toEqual([]);
  });
});
